'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import {
  createArenaActionClient,
  ensureArenaAccountExists,
  getNetworkConfig,
  formatArenaError,
  selectArenaWallet,
  submitAndConfirmArenaTransaction,
  signArenaTransaction,
  type NetworkName
} from '@/lib/stellar';
import type { ActionRecord, ActionSpec } from '@/lib/tx';
import { safeStringify, summarizeValue } from '@/lib/tx';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Input, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import useSWRMutation from 'swr/mutation';
import { useTransactionHandoffStore } from '@/stores/transaction-handoff-store';

type TransactionCardProps = {
  spec: ActionSpec;
  network: NetworkName;
  address: string;
  onRecord?: (record: ActionRecord) => void;
};

const autoPrefillFields = new Set(['from', 'admin', 'user', 'attacker', 'user1']);
const AUTO_RESET_DELAY_MS = 10_000;

function buildHandoffId(network: NetworkName, contractId: string, actionId: string) {
  return `${network}:${contractId}:${actionId}`;
}

function fieldTypeFor(type: ActionSpec['fields'][number]['type']) {
  if (type === 'amount' || type === 'u32') return 'text';
  return 'text';
}

function fieldInputMode(type: ActionSpec['fields'][number]['type']) {
  if (type === 'amount' || type === 'u32') return 'numeric';
  return 'text';
}

function needsWalletSelection(error: unknown) {
  const message = formatArenaError(error, 'Wallet selection required').toLowerCase();
  return message.includes('please set the wallet first') || message.includes('no wallet has been connected');
}

export function TransactionCard({ spec, network, address, onRecord }: TransactionCardProps) {
  const currentNetwork = useMemo(() => getNetworkConfig(network), [network]);
  const handoffId = useMemo(() => buildHandoffId(network, currentNetwork.contractId, spec.id), [network, currentNetwork.contractId, spec.id]);
  const handoff = useTransactionHandoffStore((state) => state.handoffs[handoffId]);
  const saveDraft = useTransactionHandoffStore((state) => state.saveDraft);
  const savePreview = useTransactionHandoffStore((state) => state.savePreview);
  const recordSignature = useTransactionHandoffStore((state) => state.recordSignature);
  const markSubmitted = useTransactionHandoffStore((state) => state.markSubmitted);
  const markError = useTransactionHandoffStore((state) => state.markError);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [status, setStatus] = useState<string>('');
  const recordSeqRef = useRef(0);

  function nextRecordId() {
    recordSeqRef.current += 1;
    return `${spec.id}-${recordSeqRef.current}`;
  }

  const resetXdr = useCallback(() => {
    useTransactionHandoffStore.getState().resetHandoff(handoffId);
    setStatus('');
  }, [handoffId]);

  function getFieldValue(fieldName: string, fieldType: ActionSpec['fields'][number]['type']) {
    const currentValue = draft[fieldName];
    if (typeof currentValue !== 'undefined') {
      return currentValue;
    }

    const savedValue = handoff?.draft?.[fieldName];
    if (typeof savedValue !== 'undefined') {
      return savedValue;
    }

    if (fieldType === 'address' && autoPrefillFields.has(fieldName) && address) {
      return address;
    }

    return '';
  }

  function resolveDraft() {
    return Object.fromEntries(spec.fields.map((field) => [field.name, getFieldValue(field.name, field.type)]));
  }

  const { trigger: previewAction, isMutating: isPreviewing } = useSWRMutation(
    [network, currentNetwork.contractId, spec.id, address],
    async () => {
      if (!address) {
        throw new Error('Connect a wallet first');
      }

      const client = createArenaActionClient(currentNetwork, address);
      if (!client) {
        throw new Error('Set a contract id first');
      }

      const accountExists = await ensureArenaAccountExists(currentNetwork, address);

      if (!accountExists) {
        throw new Error(`This wallet does not exist on ${currentNetwork.label} yet. Fund it, then preview again.`);
      }

      const currentDraft = resolveDraft();
      const tx = await (client as any)[spec.method](spec.buildArgs(currentDraft, address));

      return {
        draft: currentDraft,
        previewJson: tx.toJSON(),
        previewXdr: tx.toXDR(),
        previewResult: summarizeValue(tx.result),
        requiredSigners: Array.from(new Set([address, ...(tx.needsNonInvokerSigningBy?.() ?? [])].filter(Boolean))),
        isReadCall: tx.isReadCall
      };
    }
  );

  function updateField(name: string, value: string) {
    const nextDraft = { ...resolveDraft(), [name]: value };
    setDraft((current) => {
      saveDraft({
        id: handoffId,
        network,
        contractId: currentNetwork.contractId,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        draft: nextDraft
      });
      return { ...current, [name]: value };
    });
    setStatus('');
  }

  async function buildPreview() {
    setStatus('');

    try {
      const preview = await previewAction();

      savePreview({
        id: handoffId,
        network,
        contractId: currentNetwork.contractId,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        draft: preview.draft,
        previewJson: preview.previewJson,
        previewXdr: preview.previewXdr,
        previewResult: preview.previewResult,
        requiredSigners: preview.requiredSigners,
        signerCount: spec.signerCount,
        isReadCall: preview.isReadCall
      });
      setStatus(preview.requiredSigners.length > 1 ? 'Saved for multisigner handoff' : 'Preview ready for signing');
    } catch (error) {
      const message = formatArenaError(error, 'Preview failed');
      setStatus(message);
      markError(handoffId, message);
    }
  }

  async function sendSignedHandoff(signedXdr: string, signers: string[], previewResult: string) {
    setStatus('Submitted to network. Waiting for confirmation...');

    try {
      const { submission, confirmation } = await submitAndConfirmArenaTransaction(currentNetwork, signedXdr);
      const resultText = previewResult || (spec.formatResult ? spec.formatResult((confirmation as any).returnValue ?? confirmation) : `${spec.title} confirmed`);
      markSubmitted(handoffId, resultText);
      const record: ActionRecord = {
        id: nextRecordId(),
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'success',
        summary: resultText,
        details: safeStringify({ submission, confirmation }),
        signers,
        timestamp: new Date().toISOString()
      };
      onRecord?.(record);
      setStatus(resultText);
    } catch (error) {
      const message = formatArenaError(error, 'Submit failed');
      console.error('[transaction-card] confirmation failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: nextRecordId(),
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'error',
        summary: message,
        details: safeStringify(error instanceof Error ? { message: error.message } : error),
        signers,
        timestamp: new Date().toISOString()
      });
      setStatus(message);
    }
  }

  async function signCurrentWallet() {
    const activeHandoff = useTransactionHandoffStore.getState().handoffs[handoffId];
    if (!activeHandoff?.previewXdr) return;

    if (address && !activeHandoff.requiredSigners.includes(address)) {
      setStatus('This wallet is not one of the required signers');
      return;
    }

    setIsSubmitting(true);
    setStatus('');

    try {
      let signer = address;
      let signedXdr = '';

      try {
        if (!signer) {
          signer = await selectArenaWallet();
        }
        if (!signer) {
          setStatus('Select a wallet to sign');
          return;
        }

        signedXdr = await signArenaTransaction(currentNetwork, activeHandoff.signedXdr || activeHandoff.previewXdr, signer);
      } catch (error) {
        if (!needsWalletSelection(error)) {
          throw error;
        }

        signer = await selectArenaWallet();
        if (!signer) {
          setStatus('Select a wallet to sign');
          return;
        }

        if (!activeHandoff.requiredSigners.includes(signer)) {
          setStatus('This wallet is not one of the required signers');
          return;
        }

        signedXdr = await signArenaTransaction(currentNetwork, activeHandoff.signedXdr || activeHandoff.previewXdr, signer);
      }

      recordSignature(handoffId, signer, signedXdr);

      const refreshed = useTransactionHandoffStore.getState().handoffs[handoffId];
      if (refreshed?.requiredSigners.every((signer) => refreshed.signedBy.includes(signer))) {
        await sendSignedHandoff(refreshed.signedXdr || signedXdr, refreshed.signedBy, refreshed.previewResult);
        return;
      }

      setStatus('Signature saved for handoff');
    } catch (error) {
      const message = formatArenaError(error, 'Sign failed');
      console.error('[transaction-card] signing failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: nextRecordId(),
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'error',
        summary: message,
        details: safeStringify(error instanceof Error ? { message: error.message } : error),
        signers: useTransactionHandoffStore.getState().handoffs[handoffId]?.signedBy ?? [],
        timestamp: new Date().toISOString()
      });
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitReadyHandoff() {
    const activeHandoff = useTransactionHandoffStore.getState().handoffs[handoffId];
    if (!activeHandoff?.signedXdr) {
      setStatus('Add signatures first');
      return;
    }

    setIsSubmitting(true);
    setStatus('');

    try {
      await sendSignedHandoff(activeHandoff.signedXdr, activeHandoff.signedBy, activeHandoff.previewResult);
    } catch (error) {
      const message = formatArenaError(error, 'Submit failed');
      console.error('[transaction-card] submit failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: nextRecordId(),
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'error',
        summary: message,
        details: safeStringify(error instanceof Error ? { message: error.message } : error),
        signers: useTransactionHandoffStore.getState().handoffs[handoffId]?.signedBy ?? [],
        timestamp: new Date().toISOString()
      });
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPreview() {
    const activeHandoff = useTransactionHandoffStore.getState().handoffs[handoffId];
    if (!activeHandoff?.previewXdr) return;
    try {
      await navigator.clipboard.writeText(activeHandoff.signedXdr || activeHandoff.previewXdr);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1000);
    } catch {
      setStatus('Copy failed');
    }
  }

  const activeHandoff = handoff;
  const requiredSigners = activeHandoff?.requiredSigners ?? [];
  const signedBy = activeHandoff?.signedBy ?? [];
  const isSubmitted = activeHandoff?.status === 'submitted';
  const readyToSubmit = Boolean(activeHandoff?.signedXdr) && requiredSigners.every((signer) => signedBy.includes(signer));
  const canAddSignature = Boolean(activeHandoff?.previewXdr && address && requiredSigners.includes(address) && !signedBy.includes(address));
  const statusText = status || activeHandoff?.lastMessage || '';
  const primaryLabel = isSubmitted
    ? 'Submitted'
    : readyToSubmit
    ? 'Submit signed transaction'
    : activeHandoff?.signerCount > 1
      ? 'Add signature'
      : 'Sign & submit';

  useEffect(() => {
    if (activeHandoff?.status !== 'submitted') {
      return;
    }

    const timer = window.setTimeout(() => {
      resetXdr();
    }, AUTO_RESET_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activeHandoff?.status, resetXdr]);

  return (
    <Card p="5" className="stack">
      <Stack gap="4">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack gap="1">
            <Text className="label">{spec.title}</Text>
            <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
              {spec.description}
            </Text>
          </Stack>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Badge>{spec.group}</Badge>
            <Badge>{spec.signerCount} signer{spec.signerCount === 1 ? '' : 's'}</Badge>
          </div>
        </div>

        <Grid columns={{ base: 1, md: spec.fields.length > 2 ? 2 : 1 }} gap="4">
          {spec.fields.map((field) => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`${spec.id}-${field.name}`}>{field.label}</FieldLabel>
              <Input
                id={`${spec.id}-${field.name}`}
                value={getFieldValue(field.name, field.type)}
                onChange={(event) => updateField(field.name, event.target.value)}
                placeholder={field.placeholder}
                type={fieldTypeFor(field.type)}
                inputMode={fieldInputMode(field.type)}
              />
              <FieldHelperText>{field.help}</FieldHelperText>
            </Field>
          ))}
        </Grid>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <Button type="button" variant="outline" size="sm" onClick={() => void buildPreview()} disabled={isPreviewing || isSubmitting}>
            {isPreviewing ? 'Building preview...' : 'Preview'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void (readyToSubmit ? submitReadyHandoff() : signCurrentWallet())}
            disabled={!activeHandoff?.previewXdr || isPreviewing || isSubmitting || isSubmitted || (!readyToSubmit && !canAddSignature)}
          >
            {isSubmitting ? 'Working...' : primaryLabel}
          </Button>
          {activeHandoff?.previewXdr ? (
            <Button type="button" variant="plain" size="sm" onClick={() => void copyPreview()}>
              {isCopied ? <Check size={14} /> : <Copy size={14} />}
              {isCopied ? 'Copied XDR' : 'Copy XDR'}
            </Button>
          ) : null}
          {activeHandoff?.previewXdr ? (
            <Button type="button" variant="plain" size="sm" onClick={resetXdr}>
              <Trash2 size={14} />
              Reset XDR
            </Button>
          ) : null}
        </div>

        {statusText ? <Badge style={{ alignSelf: 'flex-start' }}>{statusText}</Badge> : null}

        {activeHandoff?.previewXdr ? (
          <Card p="4">
            <Stack gap="3">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {activeHandoff.isReadCall ? <Badge>Preview only</Badge> : <Badge>{activeHandoff.status}</Badge>}
                <Badge>{signedBy.length} / {requiredSigners.length || 1} signatures</Badge>
                {readyToSubmit ? <Badge>Ready to submit</Badge> : null}
              </div>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Result: {activeHandoff.previewResult}
              </Text>
              {requiredSigners.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {requiredSigners.map((signer) => (
                    <ShortId key={signer} value={signer} />
                  ))}
                </div>
              ) : null}
              {address ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Current wallet: {address}
                </Text>
              ) : null}
              {address && requiredSigners.length ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {requiredSigners.includes(address)
                    ? signedBy.includes(address)
                      ? 'This wallet already signed. Reset the XDR to collect a different signature set.'
                      : 'This wallet can sign the stored handoff.'
                    : 'Reconnect with one of the listed wallets to add the next signature.'}
                </Text>
              ) : null}
              {signedBy.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {signedBy.map((signer) => (
                    <Badge key={signer}>Signed: {signer}</Badge>
                  ))}
                </div>
              ) : null}
              <details>
                <summary style={{ cursor: 'pointer' }}>Preview payload</summary>
                <pre className="mono" style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>
                  {activeHandoff.previewJson}
                </pre>
              </details>
              <details>
                <summary style={{ cursor: 'pointer' }}>XDR</summary>
                <pre className="mono" style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>
                  {activeHandoff.signedXdr || activeHandoff.previewXdr}
                </pre>
              </details>
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Card>
  );
}

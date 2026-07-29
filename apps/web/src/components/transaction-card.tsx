'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createArenaActionClient,
  ensureArenaAccountExists,
  getNetworkConfig,
  selectArenaWallet,
  submitAndConfirmArenaTransaction,
  signArenaTransaction,
  type NetworkName
} from '@/lib/stellar';
import type { ActionRecord, ActionSpec } from '@/lib/tx';
import { safeStringify, summarizeValue } from '@/lib/tx';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Input, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';
import { useTransactionHandoffStore } from '@/stores/transaction-handoff-store';

type TransactionCardProps = {
  spec: ActionSpec;
  network: NetworkName;
  address: string;
  onRecord?: (record: ActionRecord) => void;
};

const autoPrefillFields = new Set(['from', 'admin', 'user', 'attacker', 'user1']);

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Submit failed');
  }
  return 'Submit failed';
}

function needsWalletSelection(error: unknown) {
  const message = errorMessage(error).toLowerCase();
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
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((field) => [field.name, '']))
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyLabel, setCopyLabel] = useState<'Copy XDR' | 'Copied'>('Copy XDR');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    if (handoff?.draft) {
      setDraft(handoff.draft);
    }
  }, [handoff?.id]);

  useEffect(() => {
    setDraft((current) => {
      const next = { ...current };
      for (const field of spec.fields) {
        if (field.type === 'address' && autoPrefillFields.has(field.name) && !next[field.name] && address) {
          next[field.name] = address;
        }
      }
      return next;
    });
  }, [address, spec.fields]);

  function updateField(name: string, value: string) {
    setDraft((current) => {
      const next = { ...current, [name]: value };
      saveDraft({
        id: handoffId,
        network,
        contractId: currentNetwork.contractId,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        draft: next
      });
      return next;
    });
    setStatus('');
  }

  async function buildPreview() {
    if (!address) {
      setStatus('Connect a wallet first');
      return;
    }

    const accountExists = await ensureArenaAccountExists(currentNetwork, address);
    if (!accountExists) {
      setStatus(`This wallet does not exist on ${currentNetwork.label} yet. Fund it, then preview again.`);
      return;
    }

    const client = createArenaActionClient(currentNetwork, address);
    if (!client) {
      setStatus('Set a contract id first');
      return;
    }

    setIsPreviewing(true);
    setStatus('');

    try {
      const args = spec.buildArgs(draft, address);
      const tx = await (client as any)[spec.method](args);
      const requiredSigners = Array.from(new Set([address, ...(tx.needsNonInvokerSigningBy?.() ?? [])].filter(Boolean)));
      const previewJson = tx.toJSON();
      const previewXdr = tx.toXDR();
      const previewResult = summarizeValue(tx.result);

      savePreview({
        id: handoffId,
        network,
        contractId: currentNetwork.contractId,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        draft,
        previewJson,
        previewXdr,
        previewResult,
        requiredSigners,
        signerCount: spec.signerCount,
        isReadCall: tx.isReadCall
      });
      setStatus(requiredSigners.length > 1 ? 'Saved for multisigner handoff' : 'Preview ready for signing');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      setStatus(message);
      markError(handoffId, message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function sendSignedHandoff(signedXdr: string, signers: string[], previewResult: string) {
    setStatus('Submitted to network. Waiting for confirmation...');

    try {
      const { submission, confirmation } = await submitAndConfirmArenaTransaction(currentNetwork, signedXdr);
      const resultText = previewResult || (spec.formatResult ? spec.formatResult((confirmation as any).returnValue ?? confirmation) : `${spec.title} confirmed`);
      markSubmitted(handoffId, resultText);
      const record: ActionRecord = {
        id: `${spec.id}-${Date.now()}`,
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
      const message = errorMessage(error);
      console.error('[transaction-card] confirmation failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: `${spec.id}-${Date.now()}`,
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
      const message = errorMessage(error);
      console.error('[transaction-card] signing failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: `${spec.id}-${Date.now()}`,
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
      const message = errorMessage(error);
      console.error('[transaction-card] submit failed', error);
      markError(handoffId, message);
      onRecord?.({
        id: `${spec.id}-${Date.now()}`,
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
      setCopyLabel('Copied');
      window.setTimeout(() => setCopyLabel('Copy XDR'), 1000);
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
                value={draft[field.name] ?? ''}
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
              {copyLabel}
            </Button>
          ) : null}
          {activeHandoff?.previewXdr ? (
            <Button type="button" variant="plain" size="sm" onClick={() => useTransactionHandoffStore.getState().resetHandoff(handoffId)}>
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import { createCounterActionClient, getNetworkConfig, type NetworkName } from '@/lib/stellar';
import type { ActionPreview, ActionRecord, ActionSpec } from '@/lib/tx';
import { safeStringify, summarizeValue } from '@/lib/tx';
import { Badge, Button, Card, Field, FieldHelperText, FieldLabel, Input, ShortId, Text } from '@/components/ui';
import { Grid, Stack } from 'styled-system/jsx';

type TransactionCardProps = {
  spec: ActionSpec;
  network: NetworkName;
  address: string;
  onRecord?: (record: ActionRecord) => void;
};

type PreviewState = ActionPreview & {
  assembled: any;
};

const autoPrefillFields = new Set(['from', 'admin', 'user', 'attacker']);

function fieldTypeFor(type: ActionSpec['fields'][number]['type']) {
  if (type === 'amount' || type === 'u32') return 'text';
  return 'text';
}

function fieldInputMode(type: ActionSpec['fields'][number]['type']) {
  if (type === 'amount' || type === 'u32') return 'numeric';
  return 'text';
}

export function TransactionCard({ spec, network, address, onRecord }: TransactionCardProps) {
  const currentNetwork = useMemo(() => getNetworkConfig(network), [network]);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((field) => [field.name, '']))
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyLabel, setCopyLabel] = useState<'Copy JSON' | 'Copied'>('Copy JSON');
  const [status, setStatus] = useState<string>('');

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
    setDraft((current) => ({ ...current, [name]: value }));
    setPreview(null);
    setStatus('');
  }

  async function buildPreview() {
    const client = createCounterActionClient(currentNetwork, address);
    if (!client) {
      setStatus('Set a contract id first');
      return;
    }

    setIsPreviewing(true);
    setStatus('');

    try {
      const args = spec.buildArgs(draft, address);
      const tx = await (client as any)[spec.method](args);
      const nextPreview: PreviewState = {
        assembled: tx,
        json: tx.toJSON(),
        xdr: tx.toXDR(),
        result: summarizeValue(tx.result),
        requiredSigners: tx.needsNonInvokerSigningBy?.() ?? [],
        isReadCall: tx.isReadCall
      };
      setPreview(nextPreview);
      setStatus(nextPreview.requiredSigners.length ? 'Preview ready, handoff required' : 'Preview ready for signing');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      setStatus(message);
      setPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function submitPreview() {
    if (!preview) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      const sent = await preview.assembled.signAndSend();
      const resultText = spec.formatResult ? spec.formatResult(sent.result) : `${spec.title} submitted`;
      const record: ActionRecord = {
        id: `${spec.id}-${Date.now()}`,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'success',
        summary: resultText,
        details: safeStringify(sent.result),
        signers: preview.requiredSigners,
        timestamp: new Date().toISOString()
      };
      onRecord?.(record);
      setStatus(resultText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submit failed';
      onRecord?.({
        id: `${spec.id}-${Date.now()}`,
        actionId: spec.id,
        actionTitle: spec.title,
        group: spec.group,
        status: 'error',
        summary: message,
        details: safeStringify(error instanceof Error ? { message: error.message } : error),
        signers: preview.requiredSigners,
        timestamp: new Date().toISOString()
      });
      setStatus(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPreview() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.json);
      setCopyLabel('Copied');
      window.setTimeout(() => setCopyLabel('Copy JSON'), 1000);
    } catch {
      setStatus('Copy failed');
    }
  }

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
            onClick={() => void submitPreview()}
            disabled={!preview || isPreviewing || isSubmitting || Boolean(preview?.requiredSigners.length)}
          >
            {isSubmitting ? 'Submitting...' : preview?.requiredSigners.length ? 'Handoff required' : 'Sign & submit'}
          </Button>
          {preview ? (
            <Button type="button" variant="plain" size="sm" onClick={() => void copyPreview()}>
              {copyLabel}
            </Button>
          ) : null}
        </div>

        {status ? <Badge style={{ alignSelf: 'flex-start' }}>{status}</Badge> : null}

        {preview ? (
          <Card p="4">
            <Stack gap="3">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {preview.isReadCall ? <Badge>Preview only</Badge> : <Badge>Ready</Badge>}
                {preview.requiredSigners.length ? <Badge>{preview.requiredSigners.length} additional signer(s)</Badge> : <Badge>Single signer ready</Badge>}
              </div>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                Result: {preview.result}
              </Text>
              {preview.requiredSigners.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {preview.requiredSigners.map((signer) => (
                    <ShortId key={signer} value={signer} />
                  ))}
                </div>
              ) : null}
              <details>
                <summary style={{ cursor: 'pointer' }}>Preview payload</summary>
                <pre className="mono" style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>
                  {preview.json}
                </pre>
              </details>
              <details>
                <summary style={{ cursor: 'pointer' }}>XDR</summary>
                <pre className="mono" style={{ margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>
                  {preview.xdr}
                </pre>
              </details>
            </Stack>
          </Card>
        ) : null}
      </Stack>
    </Card>
  );
}

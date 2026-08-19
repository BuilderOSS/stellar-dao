'use client';

import { useMemo, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { AuthorityPanel } from '@/components/admin/authority-panel';
import { TxExplorerLink } from '@/components/tx-explorer-link';
import { Badge, Button, Card, Heading, Input, Text } from '@/components/ui';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useGovernorSettings } from '@/lib/admin-queries';
import { useMercuryGovernorAuthorities } from '@/lib/mercury-queries';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { submitContractBatch } from '@/lib/admin-transaction';
import { type SignTransaction } from '@stellar/stellar-sdk/contract';
import { Stack, Grid } from 'styled-system/jsx';

type Drafts = Partial<{
  votingDelay: string;
  votingPeriod: string;
  proposalThreshold: string;
  quorumBps: string;
}>;

const EMPTY_DRAFTS: Drafts = {};

function formatThreshold(value: bigint) {
  return value.toString();
}

function isChanged(current: string, next: string) {
  return next.trim() !== '' && next.trim() !== current.trim();
}

function parseWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function parseBigIntValue(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return BigInt(trimmed);
}

export default function GovernanceAdminPage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const { data: settings, mutate: refreshSettings, error: settingsError, isLoading: settingsLoading } = useGovernorSettings(config, session.address || config.adminAddress);
  const { data: governorAuthorities, error: authorityError, isLoading: authorityLoading, mutate: refreshAuthorities } = useMercuryGovernorAuthorities();
  const isOwner = Boolean(session.address && session.address === config.adminAddress);
  const hasGovernanceAccess = Boolean(isOwner || governorAuthorities?.items.some((item) => item.authority === session.address));

  const pendingChanges = useMemo(() => {
    if (!settings) return [];

    const votingDelayText = drafts.votingDelay ?? String(settings.votingDelay);
    const votingPeriodText = drafts.votingPeriod ?? String(settings.votingPeriod);
    const proposalThresholdText = drafts.proposalThreshold ?? formatThreshold(settings.proposalThreshold);
    const quorumBpsText = drafts.quorumBps ?? String(settings.quorumBps);

    const votingDelay = parseWholeNumber(votingDelayText);
    const votingPeriod = parseWholeNumber(votingPeriodText);
    const proposalThreshold = parseBigIntValue(proposalThresholdText);
    const quorumBps = parseWholeNumber(quorumBpsText);

    return [
      isChanged(String(settings.votingDelay), votingDelayText) && votingDelay !== null ? { label: 'Voting delay', current: String(settings.votingDelay), next: votingDelayText.trim(), method: 'set_voting_delay' as const, args: { caller: session.address || '', voting_delay: votingDelay } } : null,
      isChanged(String(settings.votingPeriod), votingPeriodText) && votingPeriod !== null ? { label: 'Voting period', current: String(settings.votingPeriod), next: votingPeriodText.trim(), method: 'set_voting_period' as const, args: { caller: session.address || '', voting_period: votingPeriod } } : null,
      isChanged(formatThreshold(settings.proposalThreshold), proposalThresholdText) && proposalThreshold !== null ? { label: 'Proposal threshold', current: formatThreshold(settings.proposalThreshold), next: proposalThresholdText.trim(), method: 'set_proposal_threshold' as const, args: { caller: session.address || '', proposal_threshold: proposalThreshold } } : null,
      isChanged(String(settings.quorumBps), quorumBpsText) && quorumBps !== null ? { label: 'Quorum bps', current: String(settings.quorumBps), next: quorumBpsText.trim(), method: 'set_quorum_bps' as const, args: { caller: session.address || '', quorum_bps: quorumBps } } : null
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [drafts, session.address, settings]);

  async function applyChanges() {
    if (!session.address || !hasGovernanceAccess) {
      setStatus('Connect a governance authority wallet first.');
      return;
    }

    if (!config.governorContractId) {
      setStatus('Missing governor contract id in the active network config.');
      return;
    }

    if (!pendingChanges.length) {
      setStatus('No changes queued.');
      return;
    }

    const changes = pendingChanges;

    setBusy(true);
    setStatus('Building atomic governance update...');
    setTxHash('');

    try {
      const sent = await submitContractBatch({
        config,
        publicKey: session.address,
        signTransaction: (async (xdr, opts) => StellarWalletsKit.signTransaction(xdr, {
          networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
          address: opts?.address ?? session.address
        })) as SignTransaction,
        calls: changes.map((change) => ({
          contractId: config.governorContractId,
          method: change.method,
          args: change.args
        }))
      });

      setStatus(`Applied ${changes.length} change${changes.length === 1 ? '' : 's'}`);
      setTxHash(sent.hash ?? '');
      await Promise.all([refreshSettings(), refreshAuthorities()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Governance update failed');
    } finally {
      setBusy(false);
    }
  }

  if (!hasGovernanceAccess) {
    return (
      <DaoShell>
        <PageSection eyebrow="Admin" title="Governance Admin" description="Governance settings and authority management.">
          <Card p="5">
            <Stack gap="2">
              <div><Badge>Access restricted</Badge></div>
              <Heading style={{ fontSize: '1.2rem' }}>Connect a governance authority wallet to continue</Heading>
              <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                You can still view the current governor values, but only a governance authority can update them.
              </Text>
              {settings ? (
                <Stack gap="1">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Voting delay: {settings.votingDelay}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Voting period: {settings.votingPeriod}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Proposal threshold: {settings.proposalThreshold.toString()}</Text>
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Quorum: {settings.quorumBps} bps</Text>
                </Stack>
              ) : null}
            </Stack>
          </Card>
        </PageSection>
      </DaoShell>
    );
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Admin"
        title="Governance Admin"
        description="Edit governor parameters, queue multiple changes, and apply them atomically."
      >
        <Stack gap="4">
          <AdminSectionNav active="/admin/governance" />

          <Card p="5">
            <Stack gap="3">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <Stack gap="3">
                  <div><Badge>Live values</Badge></div>
                  <Heading style={{ fontSize: '1.2rem' }}>Current governor settings</Heading>
                </Stack>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshSettings()} disabled={settingsLoading}>
                  {settingsLoading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>

              {settingsError ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{settingsError.message}</Text> : null}
              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              {txHash ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}><TxExplorerLink network={config.name} txHash={txHash} /></Text> : null}
            </Stack>
          </Card>

          <Grid columns={{ base: 1, xl: 2 }} gap="4">
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting delay</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Current: {settings?.votingDelay ?? '—'} ledgers</Text>
                <Input value={drafts.votingDelay ?? String(settings?.votingDelay ?? '')} type="number" min="0" step="1" onChange={(event) => setDrafts((current) => ({ ...current, votingDelay: event.target.value }))} placeholder="New voting delay" />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>{settings && isChanged(String(settings.votingDelay), drafts.votingDelay ?? String(settings.votingDelay)) ? 'Queued for the next batch.' : 'Measured in ledgers.'}</Text>
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Voting period</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Current: {settings?.votingPeriod ?? '—'} ledgers</Text>
                <Input value={drafts.votingPeriod ?? String(settings?.votingPeriod ?? '')} type="number" min="0" step="1" onChange={(event) => setDrafts((current) => ({ ...current, votingPeriod: event.target.value }))} placeholder="New voting period" />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>{settings && isChanged(String(settings.votingPeriod), drafts.votingPeriod ?? String(settings.votingPeriod)) ? 'Queued for the next batch.' : 'Measured in ledgers.'}</Text>
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Proposal threshold</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Current: {settings?.proposalThreshold?.toString() ?? '—'} votes</Text>
                <Input value={drafts.proposalThreshold ?? formatThreshold(settings?.proposalThreshold ?? 0n)} type="number" min="0" step="1" onChange={(event) => setDrafts((current) => ({ ...current, proposalThreshold: event.target.value }))} placeholder="New proposal threshold" />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>{settings && isChanged(formatThreshold(settings.proposalThreshold), drafts.proposalThreshold ?? formatThreshold(settings.proposalThreshold)) ? 'Queued for the next batch.' : 'Measured in voting-token units.'}</Text>
              </Stack>
            </Card>
            <Card p="5">
              <Stack gap="3">
                <div>
                  <Badge>Quorum</Badge>
                </div>
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Current: {settings?.quorumBps ?? '—'} bps</Text>
                <Input value={drafts.quorumBps ?? String(settings?.quorumBps ?? '')} type="number" min="0" max="10000" step="1" onChange={(event) => setDrafts((current) => ({ ...current, quorumBps: event.target.value }))} placeholder="New quorum bps" />
                <Text className="lede" style={{ margin: 0, fontSize: '0.8rem' }}>{settings && isChanged(String(settings.quorumBps), drafts.quorumBps ?? String(settings.quorumBps)) ? 'Queued for the next batch.' : 'Use basis points, capped at 10,000.'}</Text>
              </Stack>
            </Card>
          </Grid>

          <Card p="5">
            <Stack gap="3">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <Stack gap="3">
                  <div><Badge>Pending changes</Badge></div>
                  <Heading style={{ fontSize: '1.2rem' }}>{pendingChanges.length} queued change{pendingChanges.length === 1 ? '' : 's'}</Heading>
                </Stack>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button type="button" variant="outline" onClick={() => setDrafts(settings ? {
                    votingDelay: undefined,
                    votingPeriod: undefined,
                    proposalThreshold: undefined,
                    quorumBps: undefined
                  } : EMPTY_DRAFTS)} disabled={busy || !settings}>Reset</Button>
                  <Button type="button" onClick={() => void applyChanges()} disabled={busy || !pendingChanges.length}>
                    {busy ? 'Applying...' : `Apply ${pendingChanges.length || ''} changes`}
                  </Button>
                </div>
              </div>
              {!pendingChanges.length ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Edit any field above to queue it for the next atomic update.</Text>
              ) : (
                <Stack gap="2">
                  {pendingChanges.map((change) => (
                    <Card key={change.label} p="3">
                      <Stack gap="1">
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{change.label}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.82rem' }}>Current: {change.current} → New: {change.next}</Text>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <AuthorityPanel
            title="Governor authorities"
            badge="Governance"
            description="Current wallets explicitly allowed to manage governance settings. The owner is always included."
            items={governorAuthorities?.items ?? []}
            value=""
            allowLabel=""
            revokeLabel=""
            editable={false}
            busy={authorityLoading}
            emptyLabel={authorityError?.message || 'No governance authorities indexed yet.'}
          />
        </Stack>
      </PageSection>
    </DaoShell>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as GovernorClient } from '@dao-test-stellar/governor-bindings';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { TxExplorerLink } from '@/components/tx-explorer-link';
import { Badge, Button, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { ProposalActionEditor } from '@/components/proposal/proposal-action-editor';
import { ProposalActionQueue } from '@/components/proposal/proposal-action-queue';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import {
  buildProposalCallVectors,
  type ProposalActionType,
  type ProposalQueuedAction
} from '@/lib/proposal-call';
import { encodeProposalMetadata, type ProposalMetadataDraft } from '@/lib/proposal-metadata';
import { useDaoSessionStore } from '@/stores/dao-session-store';
import { Grid, Stack } from 'styled-system/jsx';

type ProposalStep = 1 | 2 | 3;

const EMPTY_METADATA: ProposalMetadataDraft = {
  title: '',
  description: '',
  url: ''
};

const EMPTY_ACTION_STATE = {
  type: 'mint-governance-token' as ProposalActionType,
  recipient: '',
  amount: '1'
};

function makeActionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `action_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPositiveWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return false;
  }

  return Number.isSafeInteger(Number(trimmed)) && Number(trimmed) > 0;
}

export default function ProposalCreatePage() {
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const [step, setStep] = useState<ProposalStep>(1);
  const [metadata, setMetadata] = useState<ProposalMetadataDraft>(EMPTY_METADATA);
  const [actionType, setActionType] = useState<ProposalActionType>(EMPTY_ACTION_STATE.type);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [queuedActions, setQueuedActions] = useState<ProposalQueuedAction[]>([]);
  const [editingAction, setEditingAction] = useState<{ id: string; index: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ kind: 'edit' | 'remove'; actionId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [txHash, setTxHash] = useState('');

  const proposalDescription = useMemo(() => encodeProposalMetadata(metadata), [metadata]);
  const metadataIsValid = metadata.title.trim().length > 0 && metadata.description.trim().length > 0;
  const recipientIsValid = recipient.trim().length > 0;
  const amountIsValid = actionType === 'batch-mint-governance-token' ? isPositiveWholeNumber(amount) : true;
  const actionIsValid = recipientIsValid && amountIsValid;
  const canReview = metadataIsValid && queuedActions.length > 0 && !editingAction;

  function resetActionDraft(nextType?: ProposalActionType) {
    if (typeof nextType !== 'undefined') {
      setActionType(nextType);
    }

    setRecipient('');
    setAmount('1');
    setEditingAction(null);
  }

  function resetComposer() {
    setMetadata(EMPTY_METADATA);
    setQueuedActions([]);
    resetActionDraft('mint-governance-token');
    setStep(1);
  }

  function clearActionDraft() {
    resetActionDraft();
    setStatus('Action draft cleared.');
  }

  function queueAction() {
    if (!recipientIsValid) {
      setStatus('Recipient is required.');
      return;
    }

    if (actionType === 'batch-mint-governance-token' && !isPositiveWholeNumber(amount)) {
      setStatus('Amount must be a positive whole number.');
      return;
    }

    const action: ProposalQueuedAction = {
      id: editingAction?.id ?? makeActionId(),
      type: actionType,
      recipient: recipient.trim(),
      amount: actionType === 'batch-mint-governance-token' ? amount.trim() : '1'
    };

    setQueuedActions((current) => {
      if (!editingAction) {
        return [...current, action];
      }

      const next = [...current];
      const insertAt = Math.max(0, Math.min(editingAction.index, next.length));
      next.splice(insertAt, 0, action);
      return next;
    });

    setEditingAction(null);
    setRecipient('');
    setAmount('1');
    setStatus(editingAction ? 'Action updated.' : 'Action queued.');
  }

  function beginEditAction(action: ProposalQueuedAction, index: number) {
    setQueuedActions((current) => current.filter((item) => item.id !== action.id));
    setEditingAction({ id: action.id, index });
    setActionType(action.type);
    setRecipient(action.recipient);
    setAmount(action.amount);
    setStep(2);
    setStatus('Editing queued action.');
  }

  function beginRemoveAction(actionId: string) {
    setQueuedActions((current) => current.filter((action) => action.id !== actionId));
    setStatus('Action removed.');
  }

  function requestEditAction(actionId: string) {
    setPendingConfirm({ kind: 'edit', actionId });
  }

  function requestRemoveAction(actionId: string) {
    setPendingConfirm({ kind: 'remove', actionId });
  }

  function cancelPendingConfirm() {
    setPendingConfirm(null);
  }

  function confirmPendingAction() {
    if (!pendingConfirm) return;

    const actionIndex = queuedActions.findIndex((item) => item.id === pendingConfirm.actionId);
    const action = actionIndex >= 0 ? queuedActions[actionIndex] : null;
    setPendingConfirm(null);

    if (!action) {
      setStatus('That queued action is no longer available.');
      return;
    }

    if (pendingConfirm.kind === 'edit') {
      beginEditAction(action, actionIndex);
      setStatus('Action moved back into the form for editing.');
      return;
    }

    beginRemoveAction(action.id);
    setStatus('Action removed from the queue.');
  }

  function cancelEdit() {
    setEditingAction(null);
    setRecipient('');
    setAmount('1');
    setStatus('Edit cancelled.');
  }

  async function submitProposal() {
    if (!session.address) {
      setStatus('Connect a wallet first.');
      return;
    }

    if (!config.governorContractId || !config.treasuryContractId || !config.tokenContractId) {
      setStatus('Missing DAO contract ids in the active network config.');
      return;
    }

    if (!metadataIsValid) {
      setStatus('Title and description are required.');
      return;
    }

    if (editingAction) {
      setStatus('Save or cancel the action you are editing before submitting.');
      return;
    }

    if (!queuedActions.length) {
      setStatus('Add at least one action.');
      return;
    }

    setBusy(true);
    setStatus('Preparing proposal...');
    setTxHash('');

    try {
      const governor = new GovernorClient({
        contractId: config.governorContractId,
        rpcUrl: config.rpcUrl,
        networkPassphrase: config.passphrase,
        publicKey: session.address,
        signTransaction: (async (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
          StellarWalletsKit.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? config.passphrase,
            address: opts?.address ?? session.address
          }))
      });

      const { targets, functions, args } = buildProposalCallVectors(queuedActions, config.tokenContractId, config.treasuryContractId);

      const assembled = await governor.propose({
        targets,
        functions,
        args,
        description: proposalDescription,
        proposer: session.address
      });

      const sent = await assembled.signAndSend();
      resetComposer();
      setStatus('Proposal submitted');
      setTxHash(sent.sendTransactionResponse?.hash ?? '');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Proposal failed');
    } finally {
      setBusy(false);
    }
  }

  function advanceFromMetadata() {
    if (!metadataIsValid) {
      setStatus('Title and description are required.');
      return;
    }

    setStatus('');
    setStep(2);
  }

  function advanceFromActions() {
    if (!queuedActions.length) {
      setStatus('Add at least one action.');
      return;
    }

    if (editingAction) {
      setStatus('Save or cancel the action you are editing first.');
      return;
    }

    setStatus('');
    setStep(3);
  }

  return (
    <DaoShell>
      <PageSection
        eyebrow="Proposals"
        title="Create proposal"
        description="Draft proposal metadata, queue one or more actions, and review the final governor call before submitting."
      >
        <Stack gap="4">
          <Link href="/proposals" style={{ color: 'inherit' }}>Back to proposals</Link>

          <Card p="5">
            <Stack gap="3">
              <Text className="label">Create proposal</Text>
              <Heading style={{ fontSize: '1.2rem' }}>Three-step proposal flow</Heading>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Badge style={step === 1 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>1. Metadata</Badge>
                <Badge style={step === 2 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>2. Actions</Badge>
                <Badge style={step === 3 ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f3f4f6', color: '#4b5563' }}>3. Review</Badge>
              </div>

              {step === 1 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Enter the proposal metadata that will be stored as stringified JSON in the contract description.
                  </Text>
                  <Input
                    value={metadata.title}
                    onChange={(event) => setMetadata((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Proposal title"
                  />
                  <textarea
                    value={metadata.description}
                    onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Proposal description"
                    rows={6}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      border: '1px solid rgba(160, 194, 225, 0.28)',
                      background: 'transparent',
                      color: 'inherit',
                      padding: '0.875rem 1rem',
                      font: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  <Input
                    value={metadata.url ?? ''}
                    onChange={(event) => setMetadata((current) => ({ ...current, url: event.target.value }))}
                    placeholder="Optional URL"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="button" onClick={advanceFromMetadata} disabled={!metadataIsValid}>
                      Next
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step === 2 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Add one or more actions. Click a queued action to pull it back into the editor and change it.
                  </Text>

                  <Grid columns={{ base: 1, xl: 2 }} gap="4">
                    <ProposalActionEditor
                      actionType={actionType}
                      recipient={recipient}
                      amount={amount}
                      editingActionId={editingAction?.id ?? null}
                      busy={busy}
                      canSave={actionIsValid}
                      onActionTypeChange={(nextType) => {
                        setActionType(nextType);
                        if (nextType === 'batch-mint-governance-token' && amount.trim() === '') {
                          setAmount('1');
                        }
                      }}
                      onRecipientChange={setRecipient}
                      onAmountChange={setAmount}
                      onSave={queueAction}
                      onClear={editingAction ? cancelEdit : clearActionDraft}
                      onCancelEdit={cancelEdit}
                    />

                    <ProposalActionQueue
                      actions={queuedActions}
                      busy={busy}
                      onRequestEdit={requestEditAction}
                      onRequestRemove={requestRemoveAction}
                    />
                  </Grid>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button type="button" onClick={advanceFromActions} disabled={!canReview}>
                      Next
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step === 3 ? (
                <Stack gap="3">
                  <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                    Review the proposal metadata and queued actions before submitting on-chain.
                  </Text>

                  <Grid columns={{ base: 1, xl: 2 }} gap="4">
                    <Card p="4">
                      <Stack gap="2">
                        <Text className="label">Metadata</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Title: {metadata.title}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>Description: {metadata.description}</Text>
                        <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>URL: {metadata.url || '—'}</Text>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem' }}>{proposalDescription}</pre>
                      </Stack>
                    </Card>

                    <ProposalActionQueue actions={queuedActions} busy={busy} />
                  </Grid>

                  <Card p="4">
                    <Stack gap="2">
                      <Text className="label">Governor call vectors</Text>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.82rem' }}>
                        {JSON.stringify(
                          buildProposalCallVectors(queuedActions, config.tokenContractId, config.treasuryContractId),
                          null,
                          2
                        )}
                      </pre>
                    </Stack>
                  </Card>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button type="button" onClick={submitProposal} disabled={busy || !canReview}>
                      {busy ? 'Submitting...' : 'Submit proposal'}
                    </Button>
                  </div>
                </Stack>
              ) : null}

              {step < 3 ? (
                <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                  {step === 1 ? 'Start with the proposal metadata.' : 'Queue one or more actions, then continue to review.'}
                </Text>
              ) : null}

              {status ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{status}</Text> : null}
              {txHash ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}><TxExplorerLink network={config.name} txHash={txHash} /></Text> : null}
              <ShortId value={config.governorContractId} label="Governor" />
              <ShortId value={config.treasuryContractId} label="Treasury" />
              <ShortId value={config.tokenContractId} label="Token" />
            </Stack>
          </Card>
        </Stack>
        <ProposalActionConfirmDialog
          open={Boolean(pendingConfirm)}
          title={pendingConfirm?.kind === 'edit' ? 'Edit queued action?' : 'Remove queued action?'}
          message={pendingConfirm?.kind === 'edit'
            ? 'This will remove the action from the queue and load its values into the form on the left immediately.'
            : 'This will remove the action from the queue immediately.'}
          confirmLabel={pendingConfirm?.kind === 'edit' ? 'Edit action' : 'Remove action'}
          busy={busy}
          onConfirm={confirmPendingAction}
          onCancel={cancelPendingConfirm}
        />
      </PageSection>
    </DaoShell>
  );
}

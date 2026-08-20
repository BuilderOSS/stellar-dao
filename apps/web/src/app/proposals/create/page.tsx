'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Client as GovernorClient } from '@dao-test-stellar/governor-bindings';
import { DaoShell } from '@/components/dao-shell';
import { PageSection } from '@/components/page-section';
import { ProposalActionConfirmDialog } from '@/components/proposal/proposal-action-confirm-dialog';
import { Badge, Button, Callout, Card, Heading, Input, ShortId, Text } from '@/components/ui';
import { ProposalActionEditor } from '@/components/proposal/proposal-action-editor';
import { ProposalActionQueue } from '@/components/proposal/proposal-action-queue';
import type { GovernorSettings } from '@/lib/admin-queries';
import { useGovernorSettings } from '@/lib/admin-queries';
import { getTreasuryAssets } from '@/lib/assets-config';
import { getDaoNetworkConfig, getDefaultDaoNetwork } from '@/lib/dao-config';
import { useMercuryMintAuthorities } from '@/lib/mercury-queries';
import {
  buildProposalCallVectors,
  type ProposalActionType,
  type ProposalQueuedAction
} from '@/lib/proposal-call';
import { proposalIdFromBuffer } from '@/lib/proposal-id';
import { encodeProposalMetadata, type ProposalMetadataDraft } from '@/lib/proposal-metadata';
import { waitForConfirmation } from '@/lib/transaction-confirmation';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { validateStellarAddress } from '@/lib/validate-address';
import { useVotingPower, type VotingPowerSnapshot } from '@/lib/voting-power';
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
  amount: '1',
  assetCode: ''
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

function isPositiveDecimal(value: string) {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  const num = parseFloat(trimmed);
  return num > 0 && isFinite(num);
}

function requiresTreasuryMintAuthority(type: ProposalActionType) {
  return type === 'mint-governance-token' || type === 'batch-mint-governance-token';
}

function formatProposalCreationDisabledMessage(votingPower: VotingPowerSnapshot | undefined, settings: GovernorSettings | undefined, errorMessage?: string) {
  if (errorMessage) {
    return errorMessage;
  }

  if (!votingPower || !settings) {
    return 'Connect a wallet with enough voting power to create proposals.';
  }

  return `You need at least ${settings.proposalThreshold.toString()} votes to create a proposal. Current voting power: ${votingPower.votes.toString()}.`;
}

export default function ProposalCreatePage() {
  const router = useRouter();
  const session = useDaoSessionStore();
  const config = getDaoNetworkConfig(getDefaultDaoNetwork());
  const { data: mintAuthorities, isLoading: mintAuthoritiesLoading } = useMercuryMintAuthorities();
  const {
    data: votingPower,
    error: votingPowerError,
    isLoading: votingPowerLoading
  } = useVotingPower(config, session.address);
  const {
    data: governorSettings,
    error: governorSettingsError,
    isLoading: governorSettingsLoading
  } = useGovernorSettings(config, session.address || config.adminAddress);
  const [step, setStep] = useState<ProposalStep>(1);
  const [metadata, setMetadata] = useState<ProposalMetadataDraft>(EMPTY_METADATA);
  const [actionType, setActionType] = useState<ProposalActionType>(EMPTY_ACTION_STATE.type);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('1');
  const [assetCode, setAssetCode] = useState('');
  const [queuedActions, setQueuedActions] = useState<ProposalQueuedAction[]>([]);
  const [editingAction, setEditingAction] = useState<{ id: string; index: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ kind: 'edit' | 'remove'; actionId: string } | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const tx = useTransactionFeedback(config.name);

  const treasuryAssets = useMemo(() => getTreasuryAssets(config.name as 'testnet' | 'mainnet' | 'local'), [config.name]);

  const proposalDescription = useMemo(() => encodeProposalMetadata(metadata), [metadata]);
  const proposalEligibilityLoading = votingPowerLoading || governorSettingsLoading;
  const proposalEligibilityError = votingPowerError ?? governorSettingsError;
  const hasProposalVotes = Boolean(votingPower && governorSettings && votingPower.votes >= governorSettings.proposalThreshold);
  const proposalCreationLocked = !session.address || proposalEligibilityLoading || Boolean(proposalEligibilityError) || !hasProposalVotes;
  const proposalCreationLockMessage = proposalEligibilityLoading
    ? 'Checking proposal eligibility...'
    : proposalCreationLocked
      ? formatProposalCreationDisabledMessage(votingPower, governorSettings, proposalEligibilityError?.message)
      : '';
  const treasuryHasMintAuthority = Boolean(
    config.treasuryContractId && mintAuthorities?.items.some((item) => item.authority === config.treasuryContractId)
  );
  const mintAuthorityMissing = Boolean(mintAuthorities && config.treasuryContractId && !treasuryHasMintAuthority);
  const mintAuthorityError = mintAuthorityMissing
    ? 'Grant mint authority to the treasury before creating mint proposals.'
    : '';
  const actionMintAuthorityError = requiresTreasuryMintAuthority(actionType) ? mintAuthorityError : '';
  const queuedActionsNeedMintAuthority = queuedActions.some((action) => requiresTreasuryMintAuthority(action.type));
  const metadataIsValid = metadata.title.trim().length > 0 && metadata.description.trim().length > 0;
  const recipientValidation = validateStellarAddress(recipient);
  const recipientIsValid = recipientValidation.isValid;
  const recipientError = recipient.trim().length > 0 && !recipientValidation.isValid ? recipientValidation.error : undefined;
  const assetIsValid = actionType === 'transfer-sac-token' ? assetCode.trim().length > 0 : true;
  const amountIsValid = actionType === 'batch-mint-governance-token'
    ? isPositiveWholeNumber(amount)
    : actionType === 'transfer-sac-token'
    ? isPositiveDecimal(amount)
    : true;
  const actionIsValid = recipientIsValid && amountIsValid && assetIsValid && !actionMintAuthorityError && !proposalCreationLocked;
  const canReview = metadataIsValid && queuedActions.length > 0 && !editingAction && !(queuedActionsNeedMintAuthority && mintAuthorityMissing) && !proposalCreationLocked;

  function resetActionDraft(nextType?: ProposalActionType) {
    if (typeof nextType !== 'undefined') {
      setActionType(nextType);
    }

    setRecipient('');
    setAmount('1');
    setAssetCode('');
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
    setFormMessage('Action draft cleared.');
  }

  function queueAction() {
    if (proposalCreationLocked) {
      setFormMessage(proposalCreationLockMessage);
      return;
    }

    if (requiresTreasuryMintAuthority(actionType) && mintAuthorityMissing) {
      setFormMessage(mintAuthorityError);
      return;
    }

    const recipientValidation = validateStellarAddress(recipient);
    if (!recipientValidation.isValid) {
      setFormMessage(recipientValidation.error || 'Recipient is required.');
      return;
    }

    if (actionType === 'transfer-sac-token' && !assetCode.trim()) {
      setFormMessage('Please select an asset to transfer.');
      return;
    }

    if (actionType === 'batch-mint-governance-token' && !isPositiveWholeNumber(amount)) {
      setFormMessage('Amount must be a positive whole number.');
      return;
    }

    if (actionType === 'transfer-sac-token' && !isPositiveDecimal(amount)) {
      setFormMessage('Transfer amount must be a positive decimal number.');
      return;
    }

    // Find asset contract ID for SAC transfers
    const assetContractId = actionType === 'transfer-sac-token'
      ? treasuryAssets.find(a => a.code === assetCode)?.contractId
      : undefined;

    if (actionType === 'transfer-sac-token' && !assetContractId) {
      setFormMessage(`SAC contract address not configured for ${assetCode}.`);
      return;
    }

    const action: ProposalQueuedAction = {
      id: editingAction?.id ?? makeActionId(),
      type: actionType,
      recipient: recipient.trim(),
      amount: (actionType === 'batch-mint-governance-token' || actionType === 'transfer-sac-token') ? amount.trim() : '1',
      assetCode: actionType === 'transfer-sac-token' ? assetCode : undefined,
      assetContractId: actionType === 'transfer-sac-token' ? assetContractId : undefined
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
    setAssetCode('');
    setFormMessage(editingAction ? 'Action updated.' : 'Action queued.');
  }

  function beginEditAction(action: ProposalQueuedAction, index: number) {
    setQueuedActions((current) => current.filter((item) => item.id !== action.id));
    setEditingAction({ id: action.id, index });
    setActionType(action.type);
    setRecipient(action.recipient);
    setAmount(action.amount);
    setAssetCode(action.assetCode || '');
    setStep(2);
    setFormMessage('Editing queued action.');
  }

  function beginRemoveAction(actionId: string) {
    setQueuedActions((current) => current.filter((action) => action.id !== actionId));
    setFormMessage('Action removed.');
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
      setFormMessage('That queued action is no longer available.');
      return;
    }

    if (pendingConfirm.kind === 'edit') {
      beginEditAction(action, actionIndex);
      setFormMessage('Action moved back into the form for editing.');
      return;
    }

    beginRemoveAction(action.id);
    setFormMessage('Action removed from the queue.');
  }

  function cancelEdit() {
    setEditingAction(null);
    setRecipient('');
    setAmount('1');
    setFormMessage('Edit cancelled.');
  }

  async function submitProposal() {
    if (!session.address) {
      setFormMessage('Connect a wallet first.');
      return;
    }

    if (proposalCreationLocked) {
      setFormMessage(proposalCreationLockMessage);
      return;
    }

    if (!config.governorContractId || !config.treasuryContractId || !config.tokenContractId) {
      setFormMessage('Missing DAO contract ids in the active network config.');
      return;
    }

    if (!metadataIsValid) {
      setFormMessage('Title and description are required.');
      return;
    }

    if (editingAction) {
      setFormMessage('Save or cancel the action you are editing before submitting.');
      return;
    }

    if (!queuedActions.length) {
      setFormMessage('Add at least one action.');
      return;
    }

    if (queuedActionsNeedMintAuthority && mintAuthorityMissing) {
      setFormMessage(mintAuthorityError);
      return;
    }

    setBusy(true);
    setFormMessage('');
    tx.start('Preparing proposal...');

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

      const proposalId = assembled.result ? proposalIdFromBuffer(assembled.result) : '';
      const sent = await assembled.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? '';
      tx.submitted('Proposal submitted', hash);
      await waitForConfirmation(hash, config.rpcUrl);
      resetComposer();
      setFormMessage('');
      tx.success('Proposal created', hash);
      router.push(proposalId ? `/proposals/${proposalId}` : '/proposals');
    } catch (error) {
      tx.fail(error, 'Proposal failed');
    } finally {
      setBusy(false);
    }
  }

  function advanceFromMetadata() {
    if (proposalCreationLocked) {
      setFormMessage(proposalCreationLockMessage);
      return;
    }

    if (!metadataIsValid) {
      setFormMessage('Title and description are required.');
      return;
    }

    setFormMessage('');
    setStep(2);
  }

  function advanceFromActions() {
    if (proposalCreationLocked) {
      setFormMessage(proposalCreationLockMessage);
      return;
    }

    if (!queuedActions.length) {
      setFormMessage('Add at least one action.');
      return;
    }

    if (queuedActionsNeedMintAuthority && mintAuthorityMissing) {
      setFormMessage(mintAuthorityError);
      return;
    }

    if (editingAction) {
      setFormMessage('Save or cancel the action you are editing first.');
      return;
    }

    setFormMessage('');
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
          {proposalCreationLockMessage ? <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{proposalCreationLockMessage}</Text> : null}

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
                    disabled={proposalCreationLocked}
                  />
                  <textarea
                    value={metadata.description}
                    onChange={(event) => setMetadata((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Proposal description"
                    rows={6}
                    disabled={proposalCreationLocked}
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
                    disabled={proposalCreationLocked}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="button" onClick={advanceFromMetadata} disabled={!metadataIsValid || proposalCreationLocked}>
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
                      assetCode={assetCode}
                      editingActionId={editingAction?.id ?? null}
                      busy={busy}
                      canSave={actionIsValid}
                      disabledReason={proposalCreationLockMessage || (mintAuthoritiesLoading ? undefined : actionMintAuthorityError)}
                      recipientError={recipientError}
                      onActionTypeChange={(nextType) => {
                        setActionType(nextType);
                        if (nextType === 'batch-mint-governance-token' && amount.trim() === '') {
                          setAmount('1');
                        }
                        if (nextType === 'transfer-sac-token') {
                          setAmount('');
                          setAssetCode('');
                        }
                      }}
                      onRecipientChange={setRecipient}
                      onAmountChange={setAmount}
                      onAssetCodeChange={setAssetCode}
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

              {formMessage ? <Callout variant="warning" title={formMessage} /> : null}
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

'use client';

import { Badge, Button, Card, FieldHelperText, FieldLabel, Input, Select, Text } from '@/components/ui';
import { getProposalActionLabel, type ProposalActionType } from '@/lib/proposal-call';
import { Stack } from 'styled-system/jsx';

type ProposalActionEditorProps = {
  actionType: ProposalActionType;
  recipient: string;
  amount: string;
  editingActionId: string | null;
  busy: boolean;
  canSave: boolean;
  onActionTypeChange: (value: ProposalActionType) => void;
  onRecipientChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
  onCancelEdit: () => void;
};

export function ProposalActionEditor({
  actionType,
  recipient,
  amount,
  editingActionId,
  busy,
  canSave,
  onActionTypeChange,
  onRecipientChange,
  onAmountChange,
  onSave,
  onClear,
  onCancelEdit
}: ProposalActionEditorProps) {
  const batchMint = actionType === 'batch-mint-governance-token';
  const title = editingActionId ? 'Edit queued action' : 'Add action';

  return (
    <Card p="5">
      <Stack gap="3">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Stack gap="1">
            <Badge>{editingActionId ? 'Editing' : 'Action builder'}</Badge>
            <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>{title}</Text>
          </Stack>
          {editingActionId ? (
            <Button type="button" variant="outline" onClick={onCancelEdit} disabled={busy}>
              Cancel edit
            </Button>
          ) : null}
        </div>

        <Stack gap="2">
          <FieldLabel htmlFor="proposal-action-type">Action type</FieldLabel>
          <Select
            id="proposal-action-type"
            value={actionType}
            onChange={(event) => onActionTypeChange(event.target.value as ProposalActionType)}
            disabled={busy}
          >
            <option value="mint-governance-token">{getProposalActionLabel('mint-governance-token')}</option>
            <option value="batch-mint-governance-token">{getProposalActionLabel('batch-mint-governance-token')}</option>
          </Select>
          <FieldHelperText>Each queued action becomes a separate governor call in the final proposal.</FieldHelperText>
        </Stack>

        <Stack gap="2">
          <FieldLabel htmlFor="proposal-action-recipient">Recipient</FieldLabel>
          <Input
            id="proposal-action-recipient"
            value={recipient}
            onChange={(event) => onRecipientChange(event.target.value)}
            placeholder="Recipient address"
            disabled={busy}
          />
        </Stack>

        {batchMint ? (
          <Stack gap="2">
            <FieldLabel htmlFor="proposal-action-amount">Amount</FieldLabel>
            <Input
              id="proposal-action-amount"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="Amount to mint"
              type="number"
              min="1"
              step="1"
              disabled={busy}
            />
            <FieldHelperText>Use a positive whole number of tokens.</FieldHelperText>
          </Stack>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <Button type="button" variant="outline" onClick={onClear} disabled={busy}>
            Clear draft
          </Button>
          <Button type="button" onClick={onSave} disabled={busy || !canSave}>
            {editingActionId ? 'Save action' : 'Add action'}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

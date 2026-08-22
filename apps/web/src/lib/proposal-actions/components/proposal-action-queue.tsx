// src/lib/proposal-actions/components/proposal-action-queue.tsx

'use client';

import { useProposalComposerStore } from '@/stores/proposal-composer-store';
import { getActionHandler } from '../registry';
import { Card, Button, Badge, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

export function ProposalActionQueue() {
  const queuedActions = useProposalComposerStore((s) => s.queuedActions);
  const editingState = useProposalComposerStore((s) => s.editingState);
  const editingIndex = editingState?.index;
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const removeAction = useProposalComposerStore((s) => s.removeAction);

  const handleEdit = (index: number) => {
    // If already editing a different action, confirm before switching
    if (editingState && editingIndex !== index) {
      const confirmed = window.confirm(
        'You have unsaved changes. Switch to editing this action? Your current draft will be lost.'
      );
      if (!confirmed) return;
    }
    beginEdit(index);
  };

  const handleRemove = (index: number, actionLabel: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove this ${actionLabel} action?`
    );
    if (!confirmed) return;
    removeAction(index);
  };

  if (queuedActions.length === 0) {
    return (
      <Card p="4">
        <Text style={{ color: 'var(--gray-11)' }}>
          No actions queued yet. Add an action above to get started.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="3">
      {queuedActions.map((action, index) => {
        const handler = getActionHandler(action.type);
        const isEditing = editingIndex === index;

        return (
          <Card
            key={action.id}
            p="4"
            style={{
              border: isEditing ? '2px solid var(--accent-9)' : undefined,
            }}
          >
            <Stack gap="3">
              <div>
                {isEditing && (
                  <Badge style={{ marginBottom: '8px' }}>Currently editing</Badge>
                )}
                <Text style={{ fontWeight: 600, marginBottom: '4px' }}>
                  {handler.label}
                </Text>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                  To: {action.recipient}
                  {action.amount && ` • Amount: ${action.amount}`}
                  {action.assetCode && ` ${action.assetCode}`}
                </Text>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(index)}
                  disabled={isEditing}
                >
                  {isEditing ? 'Editing' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(index, handler.label)}
                  disabled={isEditing}
                >
                  Remove
                </Button>
              </div>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

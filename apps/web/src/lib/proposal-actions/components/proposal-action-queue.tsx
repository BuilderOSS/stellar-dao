// src/lib/proposal-actions/components/proposal-action-queue.tsx

'use client';

import { useProposalComposerStore } from '@/stores/proposal-composer-store';
import { getActionHandler } from '../registry';
import { Card, Button, Badge, Text } from '@/components/ui';
import { Stack } from 'styled-system/jsx';

export function ProposalActionQueue() {
  const queuedActions = useProposalComposerStore((s) => s.queuedActions);
  const editingIndex = useProposalComposerStore((s) => s.editingState?.index);
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const removeAction = useProposalComposerStore((s) => s.removeAction);

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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
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
                  onClick={() => beginEdit(index)}
                  disabled={isEditing}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeAction(index)}
                  disabled={isEditing}
                >
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </Stack>
  );
}

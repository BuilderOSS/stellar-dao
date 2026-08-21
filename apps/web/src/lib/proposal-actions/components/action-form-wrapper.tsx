// src/lib/proposal-actions/components/action-form-wrapper.tsx

'use client';

import { useCallback, useEffect, Suspense } from 'react';
import { getActionHandler } from '../registry';
import { useActionFormContext } from '../context';
import {
  useProposalComposerStore,
  selectValidationErrors,
} from '@/stores/proposal-composer-store';
import { ActionFormShell } from './action-form-shell';
import { ActionErrorBoundary } from './action-error-boundary';
import { Text } from '@/components/ui';
import type { ProposalActionType } from '../types';

/**
 * ActionFormWrapper consumes Zustand store directly
 * NO PROPS needed - all state comes from store
 */
export function ActionFormWrapper() {
  const context = useActionFormContext();

  // Subscribe to only what we need (performance optimization)
  const editingState = useProposalComposerStore((s) => s.editingState);
  const validationErrors = useProposalComposerStore(selectValidationErrors);
  const busy = useProposalComposerStore((s) => s.busy);

  // Actions
  const updateDraft = useProposalComposerStore((s) => s.updateDraft);
  const saveAction = useProposalComposerStore((s) => s.saveAction);
  const cancelEdit = useProposalComposerStore((s) => s.cancelEdit);
  const changeActionType = useProposalComposerStore((s) => s.changeActionType);
  const setValidationErrors = useProposalComposerStore((s) => s.setValidationErrors);

  // Check preconditions for current action
  const handler = editingState ? getActionHandler(editingState.actionType) : null;
  const preconditionResult = handler?.checkPreconditions?.(context) ?? { canExecute: true };

  const handleSave = useCallback(() => {
    if (!editingState) return;

    const handler = getActionHandler(editingState.actionType);
    const validation = handler.validate(editingState.draftData, context);

    if (!validation.valid) {
      setValidationErrors(validation);
      return;
    }

    const action = handler.serialize(editingState.draftData, context);
    saveAction(action);
    setValidationErrors(null);
  }, [editingState, context, saveAction, setValidationErrors]);

  const handleActionTypeChange = useCallback(
    (newType: ProposalActionType) => {
      if (!editingState) return;

      const handler = getActionHandler(editingState.actionType);
      const hasChanges =
        JSON.stringify(editingState.draftData) !==
        JSON.stringify(handler.getDefaultValues());

      if (hasChanges) {
        const confirmed = window.confirm(
          'Switching action type will clear your current draft. Continue?'
        );
        if (!confirmed) return;
      }

      changeActionType(newType);
      setValidationErrors(null);
    },
    [editingState, changeActionType, setValidationErrors]
  );

  const handleCancel = useCallback(() => {
    cancelEdit();
    setValidationErrors(null);
  }, [cancelEdit, setValidationErrors]);

  // No editing state - show empty state
  if (!editingState) {
    return null;
  }

  const FormComponent = handler!.FormComponent;
  const isDisabled = busy || !preconditionResult.canExecute;

  return (
    <ActionFormShell
      mode={editingState.mode}
      actionType={editingState.actionType}
      actionLabel={handler!.label}
      disabled={isDisabled}
      preconditionResult={preconditionResult}
      onActionTypeChange={handleActionTypeChange}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <ActionErrorBoundary actionType={editingState.actionType}>
        <Suspense fallback={<Text>Loading form...</Text>}>
          <FormComponent
            value={editingState.draftData}
            onChange={updateDraft}
            disabled={isDisabled}
            validationErrors={validationErrors || undefined}
          />
        </Suspense>
      </ActionErrorBoundary>
    </ActionFormShell>
  );
}

// src/lib/proposal-actions/actions/batch-mint-governance-token/component.tsx

'use client';

import { Stack } from 'styled-system/jsx';
import { FieldLabel, FieldHelperText, Input, Callout } from '@/components/ui';
import type { ActionFormProps } from '../../types';
import type { BatchMintGovernanceTokenData } from './types';

export function BatchMintGovernanceTokenForm({
  value,
  onChange,
  disabled,
  validationErrors,
}: ActionFormProps<BatchMintGovernanceTokenData>) {
  // Check if there's a blocking validation error (like missing mint authority)
  const hasBlockingError = Boolean(validationErrors && !validationErrors.valid && 'message' in validationErrors && validationErrors.message && !validationErrors.fields);
  const isFormDisabled = disabled || hasBlockingError;

  return (
    <Stack gap="3">
      {/* Blocking validation error (e.g., missing mint authority) */}
      {validationErrors && !validationErrors.valid && 'message' in validationErrors && validationErrors.message && !validationErrors.fields && (
        <Callout variant="error" title={validationErrors.message} />
      )}

      <Stack gap="2">
        <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
        <Input
          id="recipient"
          value={value.recipient}
          onChange={(e) => onChange({ ...value, recipient: e.target.value })}
          placeholder="Recipient address (G... or C...)"
          disabled={isFormDisabled}
          aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.recipient)}
          aria-describedby={validationErrors && !validationErrors.valid && validationErrors.fields?.recipient ? 'recipient-error' : undefined}
        />
        {validationErrors && !validationErrors.valid && validationErrors.fields?.recipient ? (
          <FieldHelperText id="recipient-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.recipient}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Enter a valid Stellar address</FieldHelperText>
        )}
      </Stack>

      <Stack gap="2">
        <FieldLabel htmlFor="amount">Amount</FieldLabel>
        <Input
          id="amount"
          type="number"
          min="1"
          max="20"
          step="1"
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          placeholder="Number of tokens (1-20)"
          disabled={isFormDisabled}
          aria-invalid={!!(validationErrors && !validationErrors.valid && validationErrors.fields?.amount)}
          aria-describedby={validationErrors && !validationErrors.valid && validationErrors.fields?.amount ? 'amount-error' : 'amount-helper'}
        />
        {validationErrors && !validationErrors.valid && validationErrors.fields?.amount ? (
          <FieldHelperText id="amount-error" style={{ color: '#f87171' }}>
            {validationErrors.fields.amount}
          </FieldHelperText>
        ) : (
          <FieldHelperText id="amount-helper">
            Batch mint allows 1-20 tokens in a single action
          </FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}

// src/lib/proposal-actions/actions/batch-mint-governance-token/index.ts

import type { ActionHandler } from '../../types';
import { BatchMintGovernanceTokenForm } from './component';
import { validateBatchMintGovernanceToken } from './validator';
import type { BatchMintGovernanceTokenData } from './types';

export const batchMintGovernanceTokenHandler: ActionHandler<BatchMintGovernanceTokenData> = {
  type: 'batch-mint-governance-token',
  label: 'Batch Mint Governance Tokens',
  description: 'Mint multiple governance tokens (1-20) to a recipient',
  order: 2,
  group: 'Governance',

  FormComponent: BatchMintGovernanceTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '1',
  }),

  validate: validateBatchMintGovernanceToken,

  serialize: (data, context) => ({
    id: crypto.randomUUID(),
    type: 'batch-mint-governance-token',
    recipient: data.recipient.trim(),
    amount: data.amount.trim(),
  }),

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '1',
  }),

  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'batch_mint',
    args: [
      context.treasuryAddress,
      data.recipient.trim(),
      parseInt(data.amount.trim(), 10),
    ],
  }),

  requiresMintAuthority: false,
};

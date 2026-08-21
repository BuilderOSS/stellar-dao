// src/lib/proposal-actions/actions/mint-governance-token/index.ts

import type { ActionHandler } from '../../types';
import { MintGovernanceTokenForm } from './component';
import { validateMintGovernanceToken } from './validator';
import type { MintGovernanceTokenData } from './types';

export const mintGovernanceTokenHandler: ActionHandler<MintGovernanceTokenData> = {
  type: 'mint-governance-token',
  label: 'Mint Governance Token',
  description: 'Mint a single governance token to a recipient',
  order: 1,
  group: 'Governance',

  FormComponent: MintGovernanceTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '1',
  }),

  validate: validateMintGovernanceToken,

  serialize: (data, context) => ({
    id: crypto.randomUUID(),
    type: 'mint-governance-token',
    recipient: data.recipient.trim(),
    amount: '1', // Always 1 for single mint
  }),

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '1',
  }),

  buildCallVector: (data, context) => ({
    target: context.tokenContractId,
    function: 'mint',
    args: [context.treasuryAddress, data.recipient.trim()],
  }),

  requiresMintAuthority: false,
};

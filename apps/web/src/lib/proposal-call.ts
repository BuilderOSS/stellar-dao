export type ProposalCallArg = string | number | boolean | null | ProposalCallArg[] | { [key: string]: ProposalCallArg };

export type ProposalCallArgs = ProposalCallArg[][];

export type ProposalActionType = 'mint-governance-token' | 'batch-mint-governance-token';

export type ProposalQueuedAction = {
  id: string;
  type: ProposalActionType;
  recipient: string;
  amount: string;
};

export type ProposalCallVectors = {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
};

function unwrapScValLike(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => unwrapScValLike(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length !== 1) {
    return Object.fromEntries(entries.map(([key, inner]) => [key, unwrapScValLike(inner)]));
  }

  const [key, inner] = entries[0];
  if (key === 'string' || key === 'symbol' || key === 'address' || key === 'bytes' || key === 'binary') {
    return unwrapScValLike(inner);
  }

  if (key === 'vec') {
    return unwrapScValLike(inner);
  }

  if (key === 'bool') {
    return Boolean(inner);
  }

  if (key === 'u32' || key === 'i32' || key === 'u64' || key === 'i64' || key === 'u128' || key === 'i128') {
    return typeof inner === 'number' ? inner : Number(inner);
  }

  return { [key]: unwrapScValLike(inner) };
}

export function normalizeProposalCallArgs(value: ProposalCallArgs | unknown): ProposalCallArgs {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((item) => {
    const decoded = typeof item === 'string' ? (() => {
      const trimmed = item.trim();
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          return JSON.parse(trimmed) as unknown;
        } catch {
          return item;
        }
      }
      return item;
    })() : item;

    return Array.isArray(decoded) ? (unwrapScValLike(decoded) as ProposalCallArg[]) : [unwrapScValLike(decoded) as ProposalCallArg];
  });
}

export function buildMintProposalCall(recipient: string, tokenContractId: string, treasuryContractId: string): {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
} {
  return {
    targets: [tokenContractId],
    functions: ['mint'],
    args: [[treasuryContractId, recipient]]
  };
}

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getProposalActionLabel(type: ProposalActionType) {
  return type === 'batch-mint-governance-token' ? 'Batch Mint Governance Token' : 'Mint Governance Token';
}

export function getProposalActionSummary(action: ProposalQueuedAction) {
  return action.type === 'batch-mint-governance-token'
    ? `${getProposalActionLabel(action.type)} to ${action.recipient} for ${action.amount} tokens`
    : `${getProposalActionLabel(action.type)} to ${action.recipient}`;
}

export function buildProposalCallVectors(actions: ProposalQueuedAction[], tokenContractId: string, treasuryContractId: string): ProposalCallVectors {
  const targets: string[] = [];
  const functions: string[] = [];
  const args: ProposalCallArgs = [];

  for (const action of actions) {
    if (action.type === 'batch-mint-governance-token') {
      const amount = parsePositiveInteger(action.amount);
      if (amount === null) {
        throw new Error('Batch mint amount must be a positive whole number.');
      }

      targets.push(tokenContractId);
      functions.push('batch_mint');
      args.push([treasuryContractId, action.recipient, amount]);
      continue;
    }

    targets.push(tokenContractId);
    functions.push('mint');
    args.push([treasuryContractId, action.recipient]);
  }

  return { targets, functions, args };
}

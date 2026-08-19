export type ProposalCallArg = string | number | boolean | null | ProposalCallArg[] | { [key: string]: ProposalCallArg };

export type ProposalCallArgs = ProposalCallArg[][];

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
    targets: [treasuryContractId],
    functions: ['execute'],
    args: [[tokenContractId, 'mint', [treasuryContractId, recipient]]]
  };
}

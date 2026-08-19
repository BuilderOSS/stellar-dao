export const ProposalState = {
  Pending: 0,
  Active: 1,
  Defeated: 2,
  Canceled: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7
} as const;

export type ProposalState = (typeof ProposalState)[keyof typeof ProposalState];

export function proposalStateLabel(state: ProposalState | null | undefined) {
  return Object.entries(ProposalState).find(([, value]) => value === state)?.[0] ?? 'Unknown';
}

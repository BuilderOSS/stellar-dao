export type ActionGroup = 'growth' | 'combat' | 'battle' | 'raid' | 'economy' | 'admin';

export type ContractActionName =
  | 'charge_up'
  | 'punch'
  | 'kick'
  | 'burn'
  | 'battle'
  | 'approve'
  | 'transfer'
  | 'burn_from'
  | 'joint_punch'
  | 'heavy_kick'
  | 'transfer_points'
  | 'reset_global'
  | 'set_cooldown_duration'
  | 'extend_my_ttl';

export type ActionFieldType = 'address' | 'amount' | 'u32' | 'text';

export type ActionField = {
  name: string;
  label: string;
  type: ActionFieldType;
  placeholder: string;
  help: string;
};

export type ActionSpec = {
  id: ContractActionName;
  title: string;
  method: ContractActionName;
  group: ActionGroup;
  description: string;
  signerCount: number;
  fields: ActionField[];
  buildArgs: (values: Record<string, string>, connectedAddress: string) => Record<string, unknown>;
  formatResult?: (result: unknown) => string;
};

export type ActionPreview = {
  json: string;
  xdr: string;
  result: string;
  requiredSigners: string[];
  isReadCall: boolean;
};

export type ActionRecord = {
  id: string;
  actionId: ContractActionName;
  actionTitle: string;
  group: ActionGroup;
  status: 'success' | 'error';
  summary: string;
  details: string;
  signers: string[];
  timestamp: string;
};

function resolveAddress(value: string, fallback: string) {
  return value.trim() || fallback;
}

function requireAddress(value: string, fallback: string, label: string) {
  const resolved = resolveAddress(value, fallback);
  if (!resolved) {
    throw new Error(`${label} is required`);
  }
  return resolved;
}

function parseAmount(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required`);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
}

function parseCount(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number`);
  }

  return parsed;
}

export function safeStringify(value: unknown) {
  return (
    JSON.stringify(value, (_, current) => (typeof current === 'bigint' ? current.toString() : current), 2) ??
    'undefined'
  );
}

export function summarizeValue(value: unknown) {
  if (value === null || typeof value === 'undefined') return 'Submitted successfully';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return safeStringify(value);
}

export const ACTION_SECTIONS: Array<{
  group: ActionGroup;
  title: string;
  hint: string;
  actions: ActionSpec[];
}> = [
  {
    group: 'growth',
    title: 'Charge Up',
    hint: 'Build your own points and keep your streak alive.',
    actions: [
      {
        id: 'charge_up',
        title: 'Charge Up',
        method: 'charge_up',
        group: 'growth',
        description: 'Increase your own points by 1.',
        signerCount: 1,
        fields: [
          { name: 'user', label: 'User', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' }
        ],
        buildArgs: (values, address) => ({
          user: requireAddress(values.user, address, 'User address')
        }),
        formatResult: () => 'Charge up complete'
      }
    ]
  },
  {
    group: 'combat',
    title: 'Light Attacks',
    hint: 'Quick unilateral drains against another player.',
    actions: [
      {
        id: 'punch',
        title: 'Punch',
        method: 'punch',
        group: 'combat',
        description: 'Drain up to 1 point from a target and gain it.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'to', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that gets drained.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Target address')
        }),
        formatResult: (result) => `Drained ${summarizeValue(result)} point(s)`
      },
      {
        id: 'kick',
        title: 'Kick',
        method: 'kick',
        group: 'combat',
        description: 'Drain up to 2 points from a target and gain them.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'to', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that gets drained.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Target address')
        }),
        formatResult: (result) => `Drained ${summarizeValue(result)} point(s)`
      }
    ]
  },
  {
    group: 'battle',
    title: 'Duel Arena',
    hint: 'Opt-in PvP where both players sign and the winner drains points.',
    actions: [
      {
        id: 'battle',
        title: 'Battle',
        method: 'battle',
        group: 'battle',
        description: 'Both players sign. Winner drains up to 3 points from the loser.',
        signerCount: 2,
        fields: [
          { name: 'attacker', label: 'Attacker', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'defender', label: 'Defender', type: 'address', placeholder: 'Opponent address', help: 'Opponent address.' }
        ],
        buildArgs: (values, address) => ({
          attacker: requireAddress(values.attacker, address, 'Attacker address'),
          defender: requireAddress(values.defender, '', 'Defender address')
        }),
        formatResult: (result) => (result ? 'Attacker won' : 'Defender won')
      }
    ]
  },
  {
    group: 'raid',
    title: 'Team Raids',
    hint: 'Allied signers coordinate to drain a target without target approval.',
    actions: [
      {
        id: 'joint_punch',
        title: 'Joint Punch',
        method: 'joint_punch',
        group: 'raid',
        description: 'Two allies jointly drain up to 4 points from a target.',
        signerCount: 2,
        fields: [
          { name: 'user1', label: 'Ally 1', type: 'address', placeholder: 'Signer 1', help: 'Defaults to your wallet if empty.' },
          { name: 'user2', label: 'Ally 2', type: 'address', placeholder: 'Signer 2', help: 'Second allied signer.' },
          { name: 'target', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that gets drained.' }
        ],
        buildArgs: (values, address) => ({
          user1: requireAddress(values.user1, address, 'Ally 1 address'),
          user2: requireAddress(values.user2, '', 'Ally 2 address'),
          target: requireAddress(values.target, '', 'Target address')
        }),
        formatResult: (result) => `Raid drained ${summarizeValue(result)} point(s)`
      },
      {
        id: 'heavy_kick',
        title: 'Heavy Kick',
        method: 'heavy_kick',
        group: 'raid',
        description: 'Three allies jointly drain up to 6 points from a target.',
        signerCount: 3,
        fields: [
          { name: 'user1', label: 'Ally 1', type: 'address', placeholder: 'Signer 1', help: 'Defaults to your wallet if empty.' },
          { name: 'user2', label: 'Ally 2', type: 'address', placeholder: 'Signer 2', help: 'Second allied signer.' },
          { name: 'user3', label: 'Ally 3', type: 'address', placeholder: 'Signer 3', help: 'Third allied signer.' },
          { name: 'target', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that gets drained.' }
        ],
        buildArgs: (values, address) => ({
          user1: requireAddress(values.user1, address, 'Ally 1 address'),
          user2: requireAddress(values.user2, '', 'Ally 2 address'),
          user3: requireAddress(values.user3, '', 'Ally 3 address'),
          target: requireAddress(values.target, '', 'Target address')
        }),
        formatResult: (result) => `Raid drained ${summarizeValue(result)} point(s)`
      }
    ]
  },
  {
    group: 'economy',
    title: 'Token Mechanics',
    hint: 'Advanced transfer and allowance flows that sit beside the game loop.',
    actions: [
      {
        id: 'transfer_points',
        title: 'Transfer Points',
        method: 'transfer_points',
        group: 'economy',
        description: 'Transfer points between two users. Both sides sign.',
        signerCount: 2,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Sender address', help: 'Sender address.' },
          { name: 'to', label: 'To', type: 'address', placeholder: 'Recipient address', help: 'Recipient address.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer point amount.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Recipient address'),
          amount: parseAmount(values.amount, 'Amount')
        }),
        formatResult: () => 'Transfer submitted'
      },
      {
        id: 'approve',
        title: 'Approve',
        method: 'approve',
        group: 'economy',
        description: 'Approve an allowance for another account.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'spender', label: 'Spender', type: 'address', placeholder: 'Spender address', help: 'The address that receives approval.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Approved point amount.' },
          { name: 'live_until_ledger', label: 'Live until ledger', type: 'u32', placeholder: '0', help: 'Optional expiration ledger.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          spender: requireAddress(values.spender, '', 'Spender address'),
          amount: parseAmount(values.amount, 'Amount'),
          live_until_ledger: parseCount(values.live_until_ledger, 'Live until ledger')
        }),
        formatResult: () => 'Allowance approved'
      },
      {
        id: 'burn',
        title: 'Burn',
        method: 'burn',
        group: 'economy',
        description: 'Burn points from your own balance.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer point amount to burn.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          amount: parseAmount(values.amount, 'Amount')
        }),
        formatResult: () => 'Burn submitted'
      },
      {
        id: 'burn_from',
        title: 'Burn From',
        method: 'burn_from',
        group: 'economy',
        description: 'Burn points from another account through allowance.',
        signerCount: 1,
        fields: [
          { name: 'spender', label: 'Spender', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'from', label: 'From', type: 'address', placeholder: 'Owner address', help: 'The account that approved the allowance.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer point amount to burn.' }
        ],
        buildArgs: (values, address) => ({
          spender: requireAddress(values.spender, address, 'Spender address'),
          from: requireAddress(values.from, '', 'Owner address'),
          amount: parseAmount(values.amount, 'Amount')
        }),
        formatResult: () => 'Allowance burn submitted'
      }
    ]
  },
  {
    group: 'admin',
    title: 'Admin-only',
    hint: 'Privileged maintenance calls separated from the normal action flow.',
    actions: [
      {
        id: 'reset_global',
        title: 'Reset global',
        method: 'reset_global',
        group: 'admin',
        description: 'Reset the global action count back to zero.',
        signerCount: 1,
        fields: [
          { name: 'admin', label: 'Admin', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' }
        ],
        buildArgs: (values, address) => ({
          admin: requireAddress(values.admin, address, 'Admin address')
        }),
        formatResult: () => 'Action count reset'
      },
      {
        id: 'set_cooldown_duration',
        title: 'Set cooldown',
        method: 'set_cooldown_duration',
        group: 'admin',
        description: 'Update the cooldown duration in seconds.',
        signerCount: 1,
        fields: [
          { name: 'admin', label: 'Admin', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'seconds', label: 'Seconds', type: 'u32', placeholder: '30', help: 'Whole number of seconds.' }
        ],
        buildArgs: (values, address) => ({
          admin: requireAddress(values.admin, address, 'Admin address'),
          seconds: parseCount(values.seconds, 'Seconds')
        }),
        formatResult: () => 'Cooldown updated'
      },
      {
        id: 'extend_my_ttl',
        title: 'Extend TTL',
        method: 'extend_my_ttl',
        group: 'admin',
        description: 'Manually extend the TTL for the connected account.',
        signerCount: 1,
        fields: [
          { name: 'user', label: 'User', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' }
        ],
        buildArgs: (values, address) => ({
          user: requireAddress(values.user, address, 'User address')
        }),
        formatResult: () => 'TTL extension requested'
      }
    ]
  }
];

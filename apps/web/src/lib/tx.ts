export type ActionGroup = 'single' | 'two' | 'three' | 'admin';

export type ContractActionName =
  | 'punch'
  | 'kick'
  | 'burn'
  | 'battle'
  | 'approve'
  | 'transfer'
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
    group: 'single',
    title: 'Single-signer',
    hint: 'Actions that can be completed from one connected wallet.',
    actions: [
      {
        id: 'punch',
        title: 'Punch',
        method: 'punch',
        group: 'single',
        description: 'Mint 1 token to the target and advance the action counter.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'to', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that receives the token.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Target address')
        }),
        formatResult: (result) => `Punch result: ${summarizeValue(result)}`
      },
      {
        id: 'kick',
        title: 'Kick',
        method: 'kick',
        group: 'single',
        description: 'Mint 2 tokens to the target.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'to', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that receives the token.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Target address')
        }),
        formatResult: (result) => `Kick result: ${summarizeValue(result)}`
      },
      {
        id: 'burn',
        title: 'Burn',
        method: 'burn',
        group: 'single',
        description: 'Burn tokens from a wallet balance.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer token amount to burn.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          amount: parseAmount(values.amount, 'Amount')
        }),
        formatResult: (result) => `Burn result: ${summarizeValue(result)}`
      },
      {
        id: 'approve',
        title: 'Approve',
        method: 'approve',
        group: 'single',
        description: 'Approve an allowance for a spender.',
        signerCount: 1,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'spender', label: 'Spender', type: 'address', placeholder: 'Spender address', help: 'The address that receives approval.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Approved token amount.' },
          { name: 'live_until_ledger', label: 'Live until ledger', type: 'u32', placeholder: '0', help: 'Optional expiration ledger.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          spender: requireAddress(values.spender, '', 'Spender address'),
          amount: parseAmount(values.amount, 'Amount'),
          live_until_ledger: parseCount(values.live_until_ledger, 'Live until ledger')
        }),
        formatResult: (result) => `Approve result: ${summarizeValue(result)}`
      }
    ]
  },
  {
    group: 'two',
    title: 'Two-signer',
    hint: 'Actions that need two authorization paths or at least a shared handoff.',
    actions: [
      {
        id: 'transfer',
        title: 'Transfer',
        method: 'transfer',
        group: 'two',
        description: 'Transfer tokens from one account to another.',
        signerCount: 2,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'to', label: 'To', type: 'address', placeholder: 'Recipient address', help: 'Recipient address.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer token amount.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Recipient address'),
          amount: parseAmount(values.amount, 'Amount')
        })
      },
      {
        id: 'battle',
        title: 'Battle',
        method: 'battle',
        group: 'two',
        description: 'Battle two accounts and record the outcome.',
        signerCount: 2,
        fields: [
          { name: 'attacker', label: 'Attacker', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' },
          { name: 'defender', label: 'Defender', type: 'address', placeholder: 'Opponent address', help: 'Opponent address.' }
        ],
        buildArgs: (values, address) => ({
          attacker: requireAddress(values.attacker, address, 'Attacker address'),
          defender: requireAddress(values.defender, '', 'Defender address')
        })
      },
      {
        id: 'joint_punch',
        title: 'Joint punch',
        method: 'joint_punch',
        group: 'two',
        description: 'Two users jointly punch a target.',
        signerCount: 2,
        fields: [
          { name: 'user1', label: 'User 1', type: 'address', placeholder: 'Signer 1', help: 'First signer.' },
          { name: 'user2', label: 'User 2', type: 'address', placeholder: 'Signer 2', help: 'Second signer.' },
          { name: 'target', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that receives the token.' }
        ],
        buildArgs: (values) => ({
          user1: requireAddress(values.user1, '', 'User 1 address'),
          user2: requireAddress(values.user2, '', 'User 2 address'),
          target: requireAddress(values.target, '', 'Target address')
        })
      },
      {
        id: 'transfer_points',
        title: 'Transfer points',
        method: 'transfer_points',
        group: 'two',
        description: 'Transfer points between two users.',
        signerCount: 2,
        fields: [
          { name: 'from', label: 'From', type: 'address', placeholder: 'Sender address', help: 'Sender address.' },
          { name: 'to', label: 'To', type: 'address', placeholder: 'Recipient address', help: 'Recipient address.' },
          { name: 'amount', label: 'Amount', type: 'amount', placeholder: '1', help: 'Integer token amount.' }
        ],
        buildArgs: (values, address) => ({
          from: requireAddress(values.from, address, 'From address'),
          to: requireAddress(values.to, '', 'Recipient address'),
          amount: parseAmount(values.amount, 'Amount')
        })
      }
    ]
  },
  {
    group: 'three',
    title: 'Three-signer',
    hint: 'Heavy coordination flows that need a full handoff.',
    actions: [
      {
        id: 'heavy_kick',
        title: 'Heavy kick',
        method: 'heavy_kick',
        group: 'three',
        description: 'Three users jointly kick a target.',
        signerCount: 3,
        fields: [
          { name: 'user1', label: 'User 1', type: 'address', placeholder: 'Signer 1', help: 'First signer.' },
          { name: 'user2', label: 'User 2', type: 'address', placeholder: 'Signer 2', help: 'Second signer.' },
          { name: 'user3', label: 'User 3', type: 'address', placeholder: 'Signer 3', help: 'Third signer.' },
          { name: 'target', label: 'Target', type: 'address', placeholder: 'Target address', help: 'The target that receives the token.' }
        ],
        buildArgs: (values) => ({
          user1: requireAddress(values.user1, '', 'User 1 address'),
          user2: requireAddress(values.user2, '', 'User 2 address'),
          user3: requireAddress(values.user3, '', 'User 3 address'),
          target: requireAddress(values.target, '', 'Target address')
        })
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
        description: 'Reset the global counter back to zero.',
        signerCount: 1,
        fields: [
          { name: 'admin', label: 'Admin', type: 'address', placeholder: 'Use connected wallet', help: 'Defaults to the connected wallet.' }
        ],
        buildArgs: (values, address) => ({
          admin: requireAddress(values.admin, address, 'Admin address')
        }),
        formatResult: () => 'Global counter reset'
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

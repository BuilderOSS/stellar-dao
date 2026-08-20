import { Badge, Card, ShortId, Text } from '@/components/ui';
import { normalizeProposalCallArgs, type ProposalCallArg, type ProposalCallArgs } from '@/lib/proposal-call';
import { Stack } from 'styled-system/jsx';

type ProposalActionPreviewProps = {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
  tokenContractId?: string;
};

function formatArg(value: ProposalCallArg) {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getActionTitle(target: string, functionName: string, args: ProposalCallArg[], tokenContractId?: string) {
  if (target === tokenContractId && functionName === 'mint') {
    return `Mint Governance Token to ${formatArg(args[1] ?? '')}`;
  }

  if (target === tokenContractId && functionName === 'batch_mint') {
    return `Batch Mint Governance Token to ${formatArg(args[1] ?? '')} for ${formatArg(args[2] ?? '')} tokens`;
  }

  return functionName;
}

export function ProposalActionPreview({ targets, functions, args, tokenContractId }: ProposalActionPreviewProps) {
  const normalizedArgs = normalizeProposalCallArgs(args);

  return (
    <Card p="5">
      <Stack gap="3">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge>Proposal actions</Badge>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>{functions.length} action{functions.length === 1 ? '' : 's'}</Text>
        </div>

        {!functions.length ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>No actions are available for this proposal.</Text>
        ) : (
          <Stack gap="2">
            {functions.map((functionName, index) => {
              const actionArgs = normalizedArgs[index] ?? [];
              const target = targets[index] ?? '';
              return (
                <Card key={`${functionName}:${index}`} p="4" style={{ border: '1px solid rgba(160, 194, 225, 0.18)', background: 'rgba(157, 179, 203, 0.06)' }}>
                  <Stack gap="2">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge>{index + 1}</Badge>
                      <Badge>{functionName}</Badge>
                    </div>
                    <Text style={{ margin: 0, fontWeight: 700 }}>{getActionTitle(target, functionName, actionArgs, tokenContractId)}</Text>
                    <ShortId value={target} label="Target" />
                    <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>Args: {actionArgs.map(formatArg).join(' | ') || '—'}</Text>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

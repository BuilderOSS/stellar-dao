import { Button } from '@/components/ui';
import { ProposalLifecyclePanel } from './proposal-lifecycle-panel';

type ProposalExecutePanelProps = {
  busy: boolean;
  now: number;
  eta: number;
  onExecute: () => void;
};

export function ProposalExecutePanel({ busy, now, eta, onExecute }: ProposalExecutePanelProps) {
  const ready = now >= eta * 1000;

  return (
    <ProposalLifecyclePanel
      badge="Execution"
      title="Execute proposal"
      description={ready ? 'This proposal is queued and ready to execute on-chain.' : 'This proposal is queued and will become executable when the ETA in the overview is reached.'}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {ready ? (
          <Button type="button" onClick={onExecute} disabled={busy}>
            {busy ? 'Executing...' : 'Execute proposal'}
          </Button>
        ) : null}
      </div>
    </ProposalLifecyclePanel>
  );
}

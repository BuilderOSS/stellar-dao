import { Button } from '@/components/ui';
import { ProposalLifecyclePanel } from './proposal-lifecycle-panel';

type ProposalQueuePanelProps = {
  busy: boolean;
  onQueue: () => void;
};

export function ProposalQueuePanel({ busy, onQueue }: ProposalQueuePanelProps) {
  return (
    <ProposalLifecyclePanel
      badge="Next step"
      title="Queue proposal"
      description="This proposal passed. Queue it to make it eligible for execution."
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" onClick={onQueue} disabled={busy}>
          {busy ? 'Queueing...' : 'Queue proposal'}
        </Button>
      </div>
    </ProposalLifecyclePanel>
  );
}

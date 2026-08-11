import { run, runQuiet } from './lib.mjs';

const containerName = 'stellar-stellar-dao-local';
const requestedContainerName = 'stellar-dao-local';

function inspectContainerHostPort() {
  const inspect = runQuiet('docker', [
    'inspect',
    '-f',
    '{{(index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort}}',
    containerName
  ]);

  if (!inspect.ok) {
    return null;
  }

  const hostPort = inspect.stdout.trim();
  return hostPort || null;
}

function ensureContainer() {
  const running = runQuiet('docker', ['inspect', '-f', '{{.State.Running}}', containerName]);
  if (running.ok && running.stdout.trim() === 'true') {
    return;
  }

  if (running.ok && running.stdout.trim() === 'false') {
    run('docker', ['start', containerName]);
    return;
  }

  const candidatePorts = [8000, 8001, 8002, 8003];
  for (const port of candidatePorts) {
    const started = runQuiet('stellar', ['container', 'start', 'local', '--name', requestedContainerName, '--ports-mapping', `${port}:8000`]);
    if (started.ok) {
      return;
    }

    const stderr = `${started.stderr}\n${started.stdout}`;
    if (stderr.includes('already running')) {
      return;
    }

    if (!stderr.includes('port is already allocated') && !stderr.includes('Bind for 0.0.0.0')) {
      throw new Error(stderr || `Failed to start local Stellar container on port ${port}`);
    }
  }

  throw new Error('Could not find a free port for the local Stellar container');
}

ensureContainer();

const mapped = inspectContainerHostPort();
run('node', ['scripts/deploy-dao.mjs', 'local'], {
  env: {
    ...process.env,
    NEXT_PUBLIC_STELLAR_LOCAL_RPC_URL: mapped ? `http://localhost:${mapped}/rpc` : 'http://localhost:8000/rpc'
  }
});

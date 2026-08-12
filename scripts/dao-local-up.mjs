import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { run, runQuiet } from './lib.mjs';

const containerName = 'stellar-stellar-dao-local';
const requestedContainerName = 'stellar-dao-local';
const configPath = 'configs/local.json';

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
const tempConfigPath = writeLocalDeployConfig(mapped);

run('node', ['scripts/deploy-dao.mjs', tempConfigPath, '--force'], {
  env: {
    ...process.env
  }
});

function writeLocalDeployConfig(mappedHostPort) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const rpcUrl = mappedHostPort ? `http://localhost:${mappedHostPort}/rpc` : config.rpcUrl;
  const suffix = createHash('sha256').update(`${configPath}:${rpcUrl}`).digest('hex').slice(0, 8);
  const tempPath = `/tmp/opencode/deploy-config-local-${suffix}.json`;

  mkdirSync('/tmp/opencode', { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify({ ...config, rpcUrl }, null, 2)}\n`);
  return tempPath;
}

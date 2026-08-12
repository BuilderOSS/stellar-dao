import { run } from './lib.mjs';

const configPath = process.argv[2];

if (!configPath) {
  throw new Error('Usage: node scripts/deploy-dao-mercury.mjs <config.json>');
}

run('pnpm', ['dao:build:mercury']);
run('node', ['scripts/deploy-dao.mjs', configPath, '--force']);

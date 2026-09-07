import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildGoldskyPipelineYaml, resolveDeploymentSelection, resolvePostgresSecretName, writeGoldskyPipeline } from '../src/pipeline-generator.mjs';

function loadInvoke() {
  const source = readFileSync(new URL('../src/activity-feed.script.js', import.meta.url), 'utf8');
  return new Function(`${source}\nreturn invoke;`)();
}

const invoke = loadInvoke();

test('buildActivityFeedRow maps governance events into feed rows', () => {
  const row = invoke({
    id: 'evt-2',
    deployment_id: 'dep-1',
    contract_id: 'CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI',
    contract_role: 'governor',
    event_name: 'ProposalQueued',
    proposal_id: 'proposal-7',
    proposer: 'GPROPOSER',
    ledger_sequence: 404,
    timestamp: '2026-09-07T00:00:00Z',
    transaction_hash: 'tx-2'
  });

  assert.deepEqual(row, {
    activity_id: 'evt-2',
    deployment_id: 'dep-1',
    contract_id: 'CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI',
    contract_role: 'governor',
    kind: 'governance.proposal_queued',
    title: 'Proposal queued',
    summary: 'Proposal proposal-7 queued',
    proposal_id: 'proposal-7',
    proposal_number: null,
    actor: 'GPROPOSER',
    addresses: '["GPROPOSER","CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI"]',
    ledger_sequence: 404,
    timestamp: '2026-09-07T00:00:00Z',
    transaction_hash: 'tx-2'
  });
});

test('buildActivityFeedRow maps auction events into feed rows', () => {
  const row = invoke({
    id: 'evt-3',
    deployment_id: 'dep-1',
    contract_id: 'CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E',
    contract_role: 'auction',
    event_name: 'BidPlaced',
    token_id: 12,
    bidder: 'GBIDDER',
    amount: '25000000',
    ledger_sequence: 505,
    ledger_closed_at: '2026-09-07T00:01:00Z',
    transaction_hash: 'tx-3'
  });

  assert.deepEqual(row, {
    activity_id: 'evt-3',
    deployment_id: 'dep-1',
    contract_id: 'CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E',
    contract_role: 'auction',
    kind: 'auction.bid_placed',
    title: 'Bid placed',
    summary: 'Bid of 25000000 placed on token 12',
    proposal_id: null,
    proposal_number: null,
    actor: 'GBIDDER',
    addresses: '["GBIDDER","CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E"]',
    ledger_sequence: 505,
    timestamp: '2026-09-07T00:01:00Z',
    transaction_hash: 'tx-3'
  });
});

test('deployment selection uses shared env names', () => {
  const selection = resolveDeploymentSelection({
    NEXT_PUBLIC_DAO_NETWORK: 'testnet',
    NEXT_PUBLIC_DAO_LABEL: 'builder'
  });

  assert.equal(selection.network, 'testnet');
  assert.equal(selection.label, 'builder');
  assert.match(selection.artifactPath, /deploys\/builder-testnet\.json$/);
});

test('postgres secret selection uses env with fallback', () => {
  assert.equal(resolvePostgresSecretName({ GOLDSKY_POSTGRES_SECRET: 'MY_SECRET' }), 'MY_SECRET');
  assert.equal(resolvePostgresSecretName({ DAO_POSTGRES: 'OLD_SECRET' }), 'OLD_SECRET');
  assert.equal(resolvePostgresSecretName({}), 'DAO_POSTGRES');
});

test('pipeline generator renders the current deployment and script', () => {
  const deployment = JSON.parse(readFileSync(new URL('../../../deploys/builder-testnet.json', import.meta.url), 'utf8'));
  const template = readFileSync(new URL('../templates/dao-stellar-events.yaml.mustache', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/activity-feed.script.js', import.meta.url), 'utf8');

  const yaml = buildGoldskyPipelineYaml({ deployment, secretName: 'MY_SECRET', templateSource: template, scriptSource: script });

  assert.match(yaml, /name: dao-stellar-events/);
  assert.match(yaml, /dataset_name: stellar_testnet\.events/);
  assert.match(yaml, /contract_id/);
  assert.match(yaml, /contract_role/);
  assert.match(yaml, /function invoke\(data\)/);
  assert.match(yaml, /CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7/);
  assert.match(yaml, /CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI/);
  assert.match(yaml, /CCPNKK3XDYHX57MNAUSWNRHDZKDOIG7DOGV43I4N3LJ74KK7TVZLXVW2/);
  assert.match(yaml, /CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E/);
  assert.match(yaml, /secret_name: MY_SECRET/);
});

test('writeGoldskyPipeline writes a file from env selection', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'goldsky-pipeline-')), 'dao-stellar-events.yaml');
  const result = writeGoldskyPipeline({
    env: {
      NEXT_PUBLIC_DAO_NETWORK: 'testnet',
      NEXT_PUBLIC_DAO_LABEL: 'builder',
      GOLDSKY_POSTGRES_SECRET: 'MY_SECRET'
    },
    outputPath
  });

  assert.equal(result.selection.network, 'testnet');
  assert.equal(result.selection.label, 'builder');
  assert.equal(result.secretName, 'MY_SECRET');
  assert.equal(result.outputPath, outputPath);
  assert.match(readFileSync(outputPath, 'utf8'), /name: dao-stellar-events/);
});

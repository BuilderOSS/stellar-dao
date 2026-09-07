import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildActivityFeedRow, normalizeGoldskyEventRow } from '../src/dao-events-transform.mjs';
import { buildGoldskyPipelineYaml, resolveDeploymentSelection, writeGoldskyPipeline } from '../src/pipeline-generator.mjs';

test('normalizeGoldskyEventRow keeps core chain fields', () => {
  const row = normalizeGoldskyEventRow({
    id: 'evt-1',
    deployment_id: 'dep-1',
    contract_id: 'CBABCDEF',
    contract_role: 'auction',
    event_name: 'BidPlaced',
    transaction_hash: 'tx-1',
    ledger_sequence: 123,
    transaction_successful: true,
    _gs_op: 'i'
  });

  assert.deepEqual(row, {
    event_id: 'evt-1',
    deployment_id: 'dep-1',
    contract_instance_id: null,
    contract_id: 'CBABCDEF',
    contract_role: 'auction',
    event_type: 'BidPlaced',
    event_name: 'BidPlaced',
    topics: null,
    data: null,
    payload: null,
    transaction_hash: 'tx-1',
    operation_index: null,
    event_index: null,
    transaction_successful: true,
    ledger_sequence: 123,
    ledger_hash: null,
    ledger_closed_at: null,
    transaction_index: null,
    operation_type: null,
    _gs_op: 'i',
    ingested_at: null
  });
});

test('normalizeGoldskyEventRow returns null when required ids are missing', () => {
  assert.equal(normalizeGoldskyEventRow({ contract_id: 'CB123' }), null);
  assert.equal(normalizeGoldskyEventRow({ id: 'evt-1' }), null);
});

test('buildActivityFeedRow maps governance events into feed rows', () => {
  const row = buildActivityFeedRow({
    event_id: 'evt-2',
    deployment_id: 'dep-1',
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
    contract_id: null,
    contract_role: null,
    kind: 'governance.proposal_queued',
    title: 'Proposal queued',
    summary: 'Proposal proposal-7 queued',
    proposal_id: 'proposal-7',
    proposal_number: null,
    actor: 'GPROPOSER',
    addresses: ['GPROPOSER'],
    ledger_sequence: 404,
    timestamp: '2026-09-07T00:00:00Z',
    transaction_hash: 'tx-2'
  });
});

test('buildActivityFeedRow maps auction events into feed rows', () => {
  const row = buildActivityFeedRow({
    event_id: 'evt-3',
    deployment_id: 'dep-1',
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
    contract_id: null,
    contract_role: null,
    kind: 'auction.bid_placed',
    title: 'Bid placed',
    summary: 'Bid of 25000000 placed on token 12',
    proposal_id: null,
    proposal_number: null,
    actor: 'GBIDDER',
    addresses: ['GBIDDER'],
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

test('pipeline generator renders the current deployment and script', () => {
  const deployment = JSON.parse(readFileSync(new URL('../../../deploys/builder-testnet.json', import.meta.url), 'utf8'));
  const template = readFileSync(new URL('../templates/dao-stellar-events.yaml.mustache', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../templates/activity-feed.script.js', import.meta.url), 'utf8');

  const yaml = buildGoldskyPipelineYaml({ deployment, templateSource: template, scriptSource: script });

  assert.match(yaml, /name: dao-stellar-events/);
  assert.match(yaml, /dataset_name: stellar_testnet\.events/);
  assert.match(yaml, /contract_id/);
  assert.match(yaml, /contract_role/);
  assert.match(yaml, /CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7/);
  assert.match(yaml, /CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI/);
  assert.match(yaml, /CCPNKK3XDYHX57MNAUSWNRHDZKDOIG7DOGV43I4N3LJ74KK7TVZLXVW2/);
  assert.match(yaml, /CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E/);
  assert.match(yaml, /secret_name: DAO_POSTGRES/);
  assert.match(yaml, /function invoke\(data\)/);
});

test('writeGoldskyPipeline writes a file from env selection', () => {
  const outputPath = join(mkdtempSync(join(tmpdir(), 'goldsky-pipeline-')), 'dao-stellar-events.yaml');
  const result = writeGoldskyPipeline({
    env: {
      NEXT_PUBLIC_DAO_NETWORK: 'testnet',
      NEXT_PUBLIC_DAO_LABEL: 'builder'
    },
    outputPath
  });

  assert.equal(result.selection.network, 'testnet');
  assert.equal(result.selection.label, 'builder');
  assert.equal(result.outputPath, outputPath);
  assert.match(readFileSync(outputPath, 'utf8'), /name: dao-stellar-events/);
});

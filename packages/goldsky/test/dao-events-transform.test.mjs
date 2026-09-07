import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActivityFeedRow, normalizeGoldskyEventRow } from '../src/dao-events-transform.mjs';

test('normalizeGoldskyEventRow keeps core chain fields', () => {
  const row = normalizeGoldskyEventRow({
    id: 'evt-1',
    deployment_id: 'dep-1',
    contract_id: 'CBABCDEF',
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

test('pipeline yaml is committed and points at current deployment', () => {
  const yaml = readFileSync(new URL('../pipelines/dao-stellar-events.yaml', import.meta.url), 'utf8');

  assert.match(yaml, /name: dao-stellar-events/);
  assert.match(yaml, /dataset_name: stellar_testnet\.events/);
  assert.match(yaml, /CBGLIC3VDPNSXRQTHIHADJVL3WVM54ZIO7FV23SDC3DQTTDLO2NMYUK7/);
  assert.match(yaml, /CCWTJATDBQN5H2M4RFTCB7Z3SHEMVZUXEB6YA7CHO5QME6AS55IUMEHI/);
  assert.match(yaml, /CCPNKK3XDYHX57MNAUSWNRHDZKDOIG7DOGV43I4N3LJ74KK7TVZLXVW2/);
  assert.match(yaml, /CBHISFJ2I27W7LWUYE3MX5ZS732BPVKPJ2BTO3ASSYAPEBSV7YZYD66E/);
  assert.match(yaml, /secret_name: DAO_POSTGRES/);
});

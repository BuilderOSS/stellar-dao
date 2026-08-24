# Goldsky and Multi-DAO Data Architecture

## Status

Planning document. This describes the intended data architecture for replacing
Mercury with Goldsky Turbo and an independently managed PostgreSQL database.
It is intentionally designed for the current testing phase while preserving a
path to a factory that deploys multiple DAOs.

## Goals

The data layer should:

- Stream Soroban data from the token, governor, treasury, and auction contracts.
- Decode and normalize contract events for frontend use.
- Preserve raw on-chain data for debugging, replay, and migration checks.
- Support multiple DAOs, networks, and redeployments without changing primary-key design.
- Expose proposal numbers starting at `1` for each DAO deployment.
- Provide stable, simple query shapes for the Next.js frontend.
- Make duplicate delivery safe.
- Keep database schema ownership, migrations, views, and indexes under our control.
- Avoid coupling contract execution to the indexing provider.

## Non-Goals

This system is not intended to:

- Replace on-chain contract state as the source of truth.
- Make the frontend query raw chain events directly.
- Use an in-memory stream transform as durable application state.
- Infer relationships between contracts from addresses when the factory can emit an explicit deployment event.
- Build a generalized analytics warehouse before the DAO product requires one.

## Current Context

The repository contains four Soroban contracts:

- `contracts/token`: transferable NFT voting units, minting, transfers, and delegation.
- `contracts/governor`: proposals, voting, lifecycle transitions, queueing, and execution.
- `contracts/treasury`: governor-controlled contract calls.
- `contracts/auction`: NFT auctions, bids, refunds, settlement, and cancellation.

The current frontend reads Mercury tables through server-side helpers in
`apps/web/src/lib/mercury.ts`. The contract events already include indexed
forms for the main domain events. The future architecture should preserve the
same contract independence: indexing is a read-side concern and must not be
required for transactions to succeed.

## Why Goldsky Turbo

Goldsky Turbo provides Stellar datasets including:

- `ledgers`
- `transactions`
- `operations`
- `events`
- `transfers`
- `ledger_entries`
- `balances`

The relevant source is the Stellar `events` dataset. Goldsky documents the
testnet source as:

```yaml
sources:
  stellar_events:
    type: dataset
    dataset_name: stellar_testnet.events
    version: 1.2.0
    start_at: latest
```

The event dataset provides generic Soroban event rows such as `id`,
`contract_id`, `topics`, `data`, `transaction_hash`, transaction status, ledger
sequence, and ledger timestamp. The source is not expected to understand this
repository's custom Retroshade event structs automatically. Decoding therefore
belongs in our pipeline transforms or in a separately maintained decoder.

Useful Goldsky references:

- [Turbo Stellar sources](https://docs.goldsky.com/turbo-pipelines/sources/stellar.md)
- [Turbo pipeline configuration](https://docs.goldsky.com/turbo-pipelines/pipeline-config.md)
- [SQL transforms](https://docs.goldsky.com/turbo-pipelines/transforms/sql.md)
- [TypeScript transforms](https://docs.goldsky.com/turbo-pipelines/transforms/typescript.md)
- [PostgreSQL sinks](https://docs.goldsky.com/turbo-pipelines/sinks/postgres.md)
- [Delivery guarantees](https://docs.goldsky.com/turbo-pipelines/delivery-guarantees.md)

## TypeScript and WebAssembly Transforms

Turbo supports TypeScript transforms compiled to WebAssembly and executed in a
QuickJS-based sandbox. They are suitable for:

- Parsing `topics` and `data` fields.
- Decoding event names and arguments.
- Normalizing field names and address values.
- Converting large integer values to decimal strings.
- Expanding one proposal event into multiple action rows.
- Filtering malformed or irrelevant events.
- Adding fields derived entirely from the current input row.

Example conceptual flow:

```text
Stellar events
  -> SQL filter by registered contract IDs
  -> TypeScript event decoder
  -> normalized event stream
  -> PostgreSQL sink
```

The transform receives one record at a time. It does not provide durable,
shared state across all records. A transform must not be used as a permanent
counter, global map, or database replacement. `parallelism: 1` can make
processing sequential within a worker, but it does not make a global counter
safe across restarts, backfills, replays, or deployments.

TypeScript can decode a proposal creation event, but it should not assign
proposal number `1`, `2`, `3`, and so on. Proposal numbering belongs in a
database view or persisted numbering table.

## Recommended System Boundary

```text
Stellar network
      |
      v
Goldsky Turbo source: stellar.events
      |
      v
SQL filter and projection
      |
      v
TypeScript/WASM event decoding
      |
      +--> raw event archive in PostgreSQL
      +--> normalized event tables in PostgreSQL
      |
      v
PostgreSQL migrations, views, indexes, and state projections
      |
      v
Next.js server/API routes
      |
      v
Frontend
```

Goldsky owns streaming ingestion. Our PostgreSQL instance owns application
schema, migrations, constraints, views, and frontend query contracts.

The browser should never connect directly to the database. Next.js server
routes or a dedicated API layer should query the database using a restricted
application role.

## Database Provider Decision

The preferred production shape is a third-party PostgreSQL provider rather
than Goldsky's hosted database.

Reasons:

- We control migrations and schema changes.
- We can add views, indexes, triggers, and constraints independently of Turbo.
- We can separate the Goldsky writer role from the application reader role.
- We can retain the database if we later change indexers.
- We can run local and CI database fixtures using the same schema migrations.
- We avoid coupling application data access to Goldsky's database product.

Provider guidance:

- **Neon** is the default recommendation for a database-first Next.js/Vercel application.
- **Supabase** is preferable if authentication, RLS, storage, or client-facing realtime are first-class requirements.
- Self-managed PostgreSQL or RDS provides more infrastructure control but adds operational work that is not needed during testing.

The provider is replaceable. The application should depend on PostgreSQL
interfaces and migrations, not provider-specific APIs.

## Database Roles and Schemas

Use separate roles:

```text
goldsky_writer   INSERT/UPDATE into ingestion tables
app_server       SELECT from frontend views and current-state tables
migration_admin  schema changes and maintenance
```

Recommended schemas:

```text
registry   DAO and contract identity
chain      raw and normalized chain records
governance proposals, actions, votes, lifecycle
token      mints, transfers, delegation, members
auction    auctions, bids, refunds, settlements
app        frontend read models and API-facing views
```

Goldsky can write to `chain`, `governance`, `token`, and `auction` tables. The
`registry` and `app` schemas should be controlled by our migrations. In the
testing phase, it is acceptable to use fewer physical schemas, but the logical
ownership boundary should remain clear.

## Multi-DAO Identity Model

The schema must support multiple DAOs before the factory exists. A contract
address alone is not a sufficient identity because a DAO can be redeployed,
testnet can reset, and the same logical DAO can exist on multiple networks.

### `registry.daos`

One logical DAO on the platform.

```text
dao_id          uuid primary key
slug            text unique not null
name            text not null
description     text
status          text not null
created_at      timestamptz not null
```

`dao_id` is a platform-generated stable identity. The factory and contract
addresses provide on-chain provenance, but do not replace this identity.

### `registry.dao_deployments`

One deployment of a logical DAO on a network.

```text
deployment_id          uuid primary key
dao_id                 uuid not null references registry.daos
network                text not null
network_passphrase     text not null
factory_contract_id    text
deployment_version     integer not null
created_ledger         bigint
created_transaction    text
status                 text not null
```

Recommended uniqueness:

```text
unique (dao_id, network, deployment_version)
```

The deployment scope is where proposal numbers, contract instances, and raw
event identities should be isolated.

### `registry.dao_contracts`

The contract registry should represent roles instead of hardcoding addresses
in every pipeline definition.

```text
contract_instance_id   uuid primary key
deployment_id          uuid not null references registry.dao_deployments
contract_role          text not null
contract_id            text not null
created_ledger         bigint
created_transaction    text
code_hash              text
```

Expected roles:

```text
factory
token
auction
```

Recommended uniqueness:

```text
unique (deployment_id, contract_role)
unique (deployment_id, contract_id)
```

## Raw Chain Data

### `chain.raw_events`

This is the immutable-ish event archive used for debugging, replay, and
comparison during the Mercury migration.

```text
event_id                         text not null
deployment_id                    uuid not null
contract_instance_id             uuid
contract_id                      text not null
event_type                       text
topics                           jsonb
data                             jsonb
transaction_hash                 text not null
operation_index                  integer
event_index                      integer
transaction_successful           boolean
ledger_sequence                  bigint not null
ledger_hash                      text
ledger_closed_at                 timestamptz
transaction_index                integer
operation_type                   text
_gs_op                           text
ingested_at                      timestamptz not null
```

The preferred logical identity is:

```text
(deployment_id, transaction_hash, operation_index, event_index)
```

If Goldsky's `id` is stable and unique for the source, retain it as
`event_id`, but do not discard the source fields needed to reconstruct a
composite identity.

### `chain.decoded_events`

This optional table contains a normalized intermediate representation after
TypeScript decoding.

```text
event_id
deployment_id
contract_instance_id
event_name
payload jsonb
ledger_sequence
transaction_hash
operation_index
event_index
```

Keeping this layer makes it possible to change frontend projections without
re-decoding the original Goldsky source.

## Domain Tables

Every domain table should carry `deployment_id`. This is required even when
there is only one DAO today.

### `governance.proposals`

One current row per proposal.

```text
deployment_id              uuid not null
proposal_id                text not null
proposal_number            integer
proposer                   text not null
description                text
snapshot_ledger             bigint
vote_start_timestamp        bigint
deadline_ledger             bigint
action_count                integer
state                       text
eta                         bigint
created_event_id            text not null
created_ledger              bigint not null
created_timestamp           timestamptz
created_transaction_hash    text
updated_ledger              bigint
updated_timestamp           timestamptz
```

Primary key:

```text
(deployment_id, proposal_id)
```

The contract's `proposal_id` remains canonical. `proposal_number` is a
frontend convenience and must never replace the canonical ID in contract
calls.

### `governance.proposal_actions`

```text
deployment_id
proposal_id
action_index
target
function
args jsonb
action_count
executed
executor
executed_ledger
executed_timestamp
transaction_hash
```

Primary key:

```text
(deployment_id, proposal_id, action_index)
```

### `governance.proposal_votes`

Store vote events as history, even if the contract currently permits one vote
per voter.

```text
vote_event_id
deployment_id
proposal_id
voter
support
weight numeric(78, 0)
reason
ledger_sequence
timestamp
transaction_hash
```

Primary key:

```text
(deployment_id, vote_event_id)
```

Expose a latest-vote view separately if the frontend needs one row per voter.

### `governance.proposal_lifecycle`

Append-only lifecycle history:

```text
lifecycle_event_id
deployment_id
proposal_id
proposer
state
eta
ledger_sequence
timestamp
transaction_hash
```

### `token.mints`

```text
event_id
deployment_id
token_id
minter
owner
ledger_sequence
timestamp
transaction_hash
```

### `token.transfers`

```text
event_id
deployment_id
token_id
operator
from_address
to_address
ledger_sequence
timestamp
transaction_hash
```

### `token.delegations`

```text
event_id
deployment_id
delegator
from_delegate
to_delegate
ledger_sequence
timestamp
transaction_hash
```

### `token.members`

Members are a current-state projection, not a direct event table.

```text
deployment_id
address
owned_token_count
delegated_to
voting_power
first_seen_ledger
last_activity_ledger
```

Primary key:

```text
(deployment_id, address)
```

The initial implementation can expose this as a PostgreSQL view. A persisted
projection can be added when query volume requires it.

### `auction.auctions`

One current row per token auction:

```text
deployment_id
token_id
start_time
end_time
reserve_price numeric(78, 0)
highest_bid_amount numeric(78, 0)
highest_bidder
payment_type
payment_token
winner
settled
cancelled
cancel_reason
created_ledger
updated_ledger
settled_ledger
```

Primary key:

```text
(deployment_id, token_id)
```

### `auction.bids`

Append-only bid history:

```text
event_id
deployment_id
token_id
bidder
amount numeric(78, 0)
payment_type
extended
new_end_time
ledger_sequence
timestamp
transaction_hash
```

### `auction.bid_refunds`

```text
event_id
deployment_id
token_id
bidder
amount numeric(78, 0)
payment_type
ledger_sequence
timestamp
transaction_hash
```

`token_id` may be nullable because the current `BidRefundedIndexed` event does
not include it.

### `auction.settlements`

```text
event_id
deployment_id
token_id
winner
amount numeric(78, 0)
payment_type
ledger_sequence
timestamp
transaction_hash
```

### `treasury.calls`

```text
event_id
deployment_id
proposal_id
governor
target
function
args jsonb
executor
action_index
ledger_sequence
timestamp
transaction_hash
```

`proposal_id` can be nullable because the treasury event does not necessarily
carry the governor proposal ID. Governor proposal-call events should be used
as the primary proposal-to-action linkage.

## Proposal Numbering

Proposal numbers are scoped to a deployment:

```text
DAO A / deployment 1 / proposal 1
DAO A / deployment 1 / proposal 2
DAO B / deployment 1 / proposal 1
```

The ordering should be deterministic:

```text
created_ledger
created_transaction_index
created_event_id
```

There are two valid implementations.

### View-based numbering

Use this for the testing phase:

```sql
CREATE VIEW app.proposals AS
SELECT
  row_number() OVER (
    PARTITION BY deployment_id
    ORDER BY created_ledger, created_transaction_index, created_event_id
  )::integer AS proposal_number,
  p.*
FROM governance.proposals p;
```

Advantages:

- No counter state to maintain.
- Easy to rebuild from raw events.
- Simple migration path while data is changing frequently.

### Persisted numbering

Use this when production URLs, notifications, or external references depend
on proposal numbers remaining unchanged:

```text
governance.proposal_numbers
  deployment_id
  proposal_id
  proposal_number
```

Add unique constraints on both `(deployment_id, proposal_id)` and
`(deployment_id, proposal_number)`. Populate it through a controlled database
job or migration process, not a stateless Turbo transform.

## Frontend Read Models

The frontend should query stable read models rather than reconstructing domain
objects from raw events.

Recommended views:

### `app.proposal_list`

```text
deployment_id
proposal_number
proposal_id
proposer
description_preview
state
created_timestamp
vote_start_timestamp
deadline_ledger
for_votes
against_votes
abstain_votes
action_count
```

### `app.proposal_detail`

```text
deployment_id
proposal_number
proposal_id
proposer
description
state
snapshot_ledger
vote_start_timestamp
deadline_ledger
eta
actions jsonb
vote_summary jsonb
```

### `app.member_list`

```text
deployment_id
address
owned_token_count
delegated_to
voting_power
last_activity_ledger
```

### `app.activity_feed`

Use a common event shape for cross-contract activity:

```text
activity_id
deployment_id
kind
title
summary
proposal_id
proposal_number
actor
addresses jsonb
ledger_sequence
timestamp
transaction_hash
```

This replaces the current Mercury-specific activity aggregation in the web
application.

## Turbo Pipeline Design

The first pipeline should be split into clear stages:

```yaml
name: dao-stellar-events
resource_size: s

sources:
  stellar_events:
    type: dataset
    dataset_name: stellar_testnet.events
    version: 1.2.0
    start_at: latest

transforms:
  dao_events:
    type: sql
    primary_key: id
    sql: |
      SELECT
        id,
        contract_id,
        topics,
        data,
        transaction_hash,
        transaction_successful,
        ledger_sequence,
        ledger_hash,
        ledger_closed_at,
        transaction_index,
        operation_type,
        _gs_op
      FROM stellar_events
      WHERE contract_id IN (
        'TOKEN_CONTRACT_ID',
        'GOVERNOR_CONTRACT_ID',
        'TREASURY_CONTRACT_ID',
        'AUCTION_CONTRACT_ID'
      )

  decoded_events:
    type: script
    from: dao_events
    language: typescript
    primary_key: id
    schema:
      id: string
      contract_id: string
      event_name: string
      topics: string
      data: string
      transaction_hash: string
      ledger_sequence: int64
      transaction_index: int32
    script: |
      function invoke(data) {
        // Decode the observed Stellar event shape here.
        // Keep the source fields so malformed events can be audited.
        return {
          ...data,
          event_name: 'unknown'
        };
      }

sinks:
  raw_events:
    type: postgres
    from: decoded_events
    schema: chain
    table: raw_events
    secret_name: DAO_POSTGRES
    primary_key: id
```

This is a starting shape, not a final deployable decoder. The exact TypeScript
decoder should be written after inspecting Goldsky's actual Stellar event rows
with `goldsky turbo inspect`.

For the first version, it is acceptable to use separate pipelines or sinks for
each normalized event family. The important property is that each output has a
stable primary key and preserves the deployment scope.

## Delivery and Idempotency

Turbo provides at-least-once delivery. A record can be delivered more than
once after a sink write succeeds but before the source position is committed.

Every stream and sink must therefore have a stable primary key:

- Raw events: source event ID or composite event identity.
- Proposal current state: `(deployment_id, proposal_id)`.
- Proposal actions: `(deployment_id, proposal_id, action_index)`.
- Append-only votes: `(deployment_id, vote_event_id)`.
- Token transfers: `(deployment_id, event_id)`.
- Current auctions: `(deployment_id, token_id)`.
- Bids and refunds: `(deployment_id, event_id)`.

For current-state rows, upsert behavior is expected. For historical event rows,
the primary key must prevent duplicate inserts while preserving each distinct
event.

Large Soroban integer values should be stored as PostgreSQL `NUMERIC`, not
JavaScript numbers. The frontend should receive them as strings when precision
matters.

## Factory Extension

When a factory contract is introduced, it should emit one explicit deployment
event containing:

```text
dao_id or dao_namespace
creator
token_contract_id

The indexer should treat that event as the authoritative registration of a DAO
deployment. It should not rely only on correlating four independent
initialization events by ledger or transaction.

The factory event should populate:

```text
registry.daos
registry.dao_deployments
registry.dao_contracts
```

After registration, all contract event streams can resolve their
`deployment_id` through the contract registry.

If the factory creates contracts in the same transaction, store the factory
transaction hash and ledger as provenance on the deployment record.

## Testing-Phase Scope

Do not implement the complete platform architecture immediately. Preserve the
future boundaries while keeping the first deployment small:

1. Create one manual `daos` row.
2. Create one `dao_deployments` row for the current testnet deployment.
3. Register the four contract instances.
4. Add `deployment_id` to all normalized records.
5. Stream raw events into PostgreSQL.
6. Decode only the events needed by the current frontend.
7. Use a view for proposal numbers.
8. Add frontend read views for proposals, members, and activity.
9. Compare responses against Mercury before removing Mercury.

This avoids premature factory work while preventing a single-DAO schema from
becoming a migration blocker.

## Migration Plan

### Phase 1: Observe

- Deploy a Turbo pipeline to a blackhole sink.
- Inspect Stellar event rows and confirm `topics` and `data` encoding.
- Record actual event volume and historical backfill requirements.

### Phase 2: Archive

- Provision Neon or Supabase PostgreSQL.
- Add migrations for registry and raw event tables.
- Create a restricted Goldsky writer role.
- Stream raw events with stable primary keys.

### Phase 3: Decode

- Implement TypeScript/WASM event decoding.
- Store decoded events without dropping raw payloads.
- Add malformed-event tracking rather than silently discarding failures.

### Phase 4: Project

- Populate proposals, actions, votes, lifecycle, token, auction, and treasury tables.
- Add current-state views and indexes.
- Add proposal numbering scoped by deployment.

### Phase 5: Migrate Frontend Reads

- Replace Mercury API helpers with database-backed server queries.
- Preserve response shapes initially to reduce UI changes.
- Compare proposal, vote, member, token, and activity results against Mercury.

### Phase 6: Retire Mercury

- Keep raw event and reconciliation checks available.
- Stop new Mercury reads.
- Remove Mercury credentials and deployment steps after a verification period.

## Open Decisions

These decisions should be made before production implementation:

- Neon or Supabase as the managed PostgreSQL provider.
- Whether proposal numbers are view-derived or persisted.
- Whether event decoding lives entirely in Turbo or partly in a versioned application worker.
- The exact factory deployment event and DAO identity fields.
- Whether `members` is a view or a persisted projection at launch.
- The historical ledger from which each deployment should be backfilled.
- Whether the frontend API will use raw SQL, an ORM, or a typed query layer.

## Recommended Decision

Use Goldsky Turbo TypeScript transforms for per-event decoding and row
normalization, and use a third-party PostgreSQL database for durable relational
state and frontend read models.

Start with one manually registered DAO deployment, but include `dao_id`,
`deployment_id`, and contract-instance identity in the schema now. Use a
deployment-scoped PostgreSQL view for `proposal_number` during testing. Move to
a persisted numbering table only when proposal numbers become externally
referenced or production data needs stronger immutability guarantees.

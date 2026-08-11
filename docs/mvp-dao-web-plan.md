# MVP DAO Web Plan

## Goal

Build a clean, low-friction DAO web app for a single test DAO.

The app should support:

- wallet connection
- governance browsing and voting
- treasury visibility
- admin minting
- address profiles
- token metadata pages
- deterministic token metadata API

## Contract Shape

- `token`: transferable NFT voting token
- `governor`: proposal, vote, and execution logic
- `treasury`: governor-authorized execution boundary

## Metadata Research

OpenZeppelin Stellar NFTs derive token URIs from the token contract's `base_uri`.

Observed behavior in the upstream token package:

- `Base::set_metadata(e, base_uri, name, symbol)` stores the collection metadata.
- `Base::token_uri(e, token_id)` returns `base_uri + token_id`.
- `base_uri` is expected to end with `/`.
- No slash is inserted automatically.
- If `base_uri` is empty, `token_uri` is empty.

This means the token contract should be deployed with a base URI like:

- `https://app.example.com/api/token/`

For this MVP, that gives a canonical metadata URL of:

- `GET /api/token/[tokenId]`

## Route Map

### Public

- `/` - DAO overview
- `/proposals` - proposal list
- `/proposals/[proposalId]` - proposal detail
- `/treasury` - treasury overview and execution history
- `/members` - member directory
- `/profile/[address]` - address profile
- `/token/[tokenId]` - token detail page

### Admin

- `/admin` - admin minting page, visible only to the admin address

### API

- `/api/token/[tokenId]` - metadata JSON
- `/api/token/[tokenId]/image.svg` - deterministic token image

## Page Goals

### `/`

The home page should answer three questions immediately:

- what is the DAO state
- what can I do right now
- where do I go next

Key modules:

- active proposal summary
- quorum / voting power summary
- treasury summary
- wallet state
- recent DAO activity

### `/proposals`

This is the main governance workspace.

Show:

- active proposals first
- followed by pending, succeeded, executed, defeated, canceled
- time remaining
- quorum progress
- vote totals

Primary actions:

- open proposal
- vote
- inspect execution payload

### `/proposals/[proposalId]`

This is the decision page.

Show:

- proposal title and description
- current state
- vote progress against quorum
- timeline
- vote cast panel
- call payloads
- execution status and receipt

The user should be able to understand in under 10 seconds:

- what this proposal does
- whether it can still be voted on
- whether it passed
- whether it executed

### `/treasury`

This is a read-heavy operations page.

Show:

- treasury address
- recent executions
- linked proposal history
- contract health
- authorized execution summary

This page should not feel like a wallet page. It should feel like governance infrastructure.

### `/members`

This is the participation directory.

Show:

- addresses with voting power
- token counts
- delegation state
- proposal activity

Each member row should link to `/profile/[address]`.

### `/profile/[address]`

This is the identity page for any address.

Show:

- address header
- tokens owned
- voting power
- delegate
- proposals created
- votes cast
- transfers in/out
- recent activity

This page is the canonical place to understand a wallet's DAO role.

### `/token/[tokenId]`

This is the human-facing token page.

Show:

- token id
- token owner
- token image
- token metadata
- link to owner profile
- link to metadata JSON

Use this page as the readable companion to the API metadata route.

### `/admin`

Admin page, only visible to the configured admin address.

Show:

- current admin address
- mint form
- recent mints
- deployment hints

Keep this page minimal and operational.

## Admin Visibility

The admin page should be hidden unless:

- a wallet is connected
- the connected address matches the configured admin address

If the user is not admin:

- hide the route from navigation
- do not show admin controls in shared components
- render a neutral access-denied state if the route is visited directly

## Proposal States

Use on-chain states, not UI-only states, for governance display.

States:

- `Pending`
- `Active`
- `Succeeded`
- `Defeated`
- `Executed`
- `Canceled`

`Draft` should be UI-only if a proposal composer exists before submission.

## Metadata API

### `GET /api/token/[tokenId]`

Returns NFT metadata JSON.

Suggested payload:

```json
{
  "name": "DAO Vote NFT #12",
  "description": "Voting token for the DAO MVP.",
  "image": "https://app.example.com/api/token/12/image.svg",
  "attributes": [
    { "trait_type": "Token ID", "value": "12" },
    { "trait_type": "DAO Role", "value": "Voting" }
  ]
}
```

### `GET /api/token/[tokenId]/image.svg`

Returns a deterministic SVG image.

Use a very small seeded generator:

- seed = `tokenId`
- PRNG = `xorshift32` or `mulberry32`
- derive background color
- derive accent color
- derive one or two shapes
- optionally render the token id as text

Rules:

- same token id must always render the same image
- no external dependencies required
- SVG is preferred over raster for simplicity and determinism

## Token Metadata Flow

The token contract `base_uri` should point at the metadata endpoint root:

- `https://app.example.com/api/token/`

Then the upstream contract URI composition yields:

- token 7 -> `https://app.example.com/api/token/7`

The JSON response for that route should contain the `image` URL to the SVG endpoint.

This keeps the contract-side URI generation simple and lets the web app own the presentation layer.

## Main UX Flows

### Connect and Orient

1. user opens home page
2. wallet connection is prompted or highlighted
3. app shows current voting power and relevant DAO state
4. user is guided to proposals, profile, or admin if permitted

### Vote

1. user opens proposal list
2. user opens proposal detail
3. proposal state and quorum are shown clearly
4. user casts vote
5. confirmation updates the proposal and profile views

### Mint as Admin

1. admin opens `/admin`
2. app verifies connected address
3. admin enters recipient and token details
4. admin submits mint transaction
5. new token appears in profile and token page views

### Inspect a Profile

1. user clicks an address from members, votes, or proposal activity
2. profile loads token count, voting power, and delegation
3. profile links out to token pages and proposals

### Inspect a Token

1. user opens `/token/[tokenId]`
2. page shows the generated image and human-readable metadata
3. page links back to the owner profile
4. metadata route remains the source of truth for wallets

## Information Hierarchy

Top-level nav:

- Overview
- Proposals
- Treasury
- Members
- Profile
- Admin

The app should always privilege:

- action availability
- governance status
- identity context
- transparency of execution

## Visual Direction

Keep the design sober and functional.

Recommended feel:

- high-contrast dark UI
- minimal chrome
- strong hierarchy
- status badges for proposal state and admin gating
- dense but readable data surfaces

Avoid game-like styling. This is a governance product.

## Build Order

1. route structure and nav shell
2. overview page
3. proposals list and detail
4. profile page
5. admin page and mint flow
6. token detail page
7. metadata JSON endpoint
8. deterministic SVG image endpoint

## MVP Success Criteria

- user can connect wallet and understand their voting power
- user can browse proposals and vote
- admin can mint NFT voting tokens
- any address has a profile page
- every token has a readable page and metadata JSON
- token metadata is deterministic and stable
- `/api/token/[tokenId]` matches the contract base URI convention

# Artwork Requirements & IPFS Specification

**Status**: Awaiting artwork examples from user
**Purpose**: Document Nouns Builder-compatible IPFS artwork structure for Stellar implementation

## Overview

The new `nouns-stellar` implementation will use **IPFS-hosted generative artwork** following Nouns Builder patterns, adapted for Stellar/Soroban. Each NFT stores an **immutable seed** on-chain, which deterministically generates artwork from IPFS-hosted trait layers.

## Current Implementation (To Replace)

**Location**: `apps/web/src/app/api/token/[id]/image.svg/route.tsx`

The prototype generates SVG images server-side based on:
- Token ID (determines colors/patterns)
- Deployment-wide branding (DAO name)
- Simple geometric patterns (no trait layers)

**Example output**: Single-color circular avatar with token ID

**Limitations**:
- Not generative from traits
- No IPFS storage
- No on-chain seeds
- Not Nouns-compatible

## Required Architecture

### On-Chain (Soroban Contracts)

```rust
// Token Contract - Immutable seed storage
pub struct TokenMetadata {
    pub token_id: u32,
    pub seed: ArtSeed, // Stored once at mint, never changes
}

pub struct ArtSeed {
    pub background: u8,
    pub body: u8,
    pub accessory: u8,
    pub head: u8,
    pub glasses: u8,
    // ... additional traits as needed
}

// MetadataRegistry Contract - Versioned renderer config
pub struct MetadataConfig {
    pub version: u32,
    pub ipfs_base_uri: String,      // e.g., "ipfs://QmXxx..."
    pub renderer_base_url: String,   // e.g., "https://renderer.nouns.wtf"
    pub trait_count: Map<String, u8>, // e.g., {"background": 5, "body": 30}
}
```

### IPFS Structure (Awaiting Examples)

**Expected pattern** based on Nouns Builder:

```
ipfs://QmXxx.../
├── manifest.json          # Metadata about the artwork collection
├── layers/
│   ├── background/
│   │   ├── 0-cool.png
│   │   ├── 1-warm.png
│   │   └── 2-gray.png
│   ├── body/
│   │   ├── 0-default.png
│   │   ├── 1-special.png
│   │   └── ...
│   ├── accessory/
│   │   ├── 0-none.png
│   │   ├── 1-chain.png
│   │   └── ...
│   ├── head/
│   │   ├── 0-cap.png
│   │   └── ...
│   └── glasses/
│       ├── 0-square.png
│       └── ...
└── README.md (optional)
```

### Manifest Schema (To Be Confirmed)

```json
{
  "name": "Example DAO Artwork",
  "description": "Generative NFT artwork for Example DAO",
  "version": "1.0.0",
  "traits": [
    {
      "name": "background",
      "displayName": "Background",
      "count": 5,
      "files": [
        {"index": 0, "name": "cool", "file": "layers/background/0-cool.png"},
        {"index": 1, "name": "warm", "file": "layers/background/1-warm.png"}
      ]
    },
    {
      "name": "body",
      "displayName": "Body",
      "count": 30,
      "files": [...]
    }
  ],
  "dimensions": {
    "width": 320,
    "height": 320
  },
  "format": "png"
}
```

**Questions for user examples**:
1. Is this manifest structure correct?
2. What are the actual dimension requirements?
3. Are trait indexes zero-based?
4. What image formats are supported? (PNG, SVG, both?)
5. How are trait names normalized? (lowercase, hyphens, underscores?)

## Seed Generation

### Deterministic Requirements

```typescript
// Token ID → Art Seed (deterministic)
function generateSeed(tokenId: number): ArtSeed {
  // Use token ID as entropy source
  // Must be reproducible: same token ID = same seed always
  // Must respect trait counts from metadata config

  // Example approach (to be validated):
  const hash = keccak256(tokenId.toString())
  return {
    background: hash[0] % traitCounts.background,
    body: hash[1] % traitCounts.body,
    accessory: hash[2] % traitCounts.accessory,
    head: hash[3] % traitCounts.head,
    glasses: hash[4] % traitCounts.glasses,
  }
}
```

**Critical properties**:
- ✅ Deterministic (token ID → seed is pure function)
- ✅ Bounded (seed values < trait counts)
- ✅ Reproducible (same token ID always generates same seed)
- ❓ Rarity distribution (is uniform distribution acceptable, or weighted?)

**Non-requirement** (per MVP plan):
- ❌ Unbiased rarity (determinism ≠ fair rarity distribution)
- ❌ Collision avoidance (two tokens may have identical seeds)

## Rendering Pipeline

### Server-Side Rendering

```typescript
// apps/web/src/app/api/dao/[daoId]/token/[tokenId]/image.png/route.ts

export async function GET(
  req: Request,
  { params }: { params: { daoId: string; tokenId: string } }
) {
  // 1. Resolve DAO deployment and token contract
  const dao = await getDeployment(params.daoId)

  // 2. Fetch token seed from contract (RPC)
  const seed = await tokenContract.getTokenSeed(params.tokenId)

  // 3. Fetch metadata config from MetadataRegistry (RPC)
  const config = await metadataRegistry.getConfig()

  // 4. Validate token exists
  if (!seed) return new Response('Token not found', { status: 404 })

  // 5. Resolve IPFS artwork layers
  const layers = await fetchIPFSLayers(config.ipfs_base_uri, seed)

  // 6. Composite image
  const image = await compositeImage(layers)

  // 7. Return with caching
  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable', // Seed never changes
    },
  })
}
```

### Metadata Endpoint

```typescript
// apps/web/src/app/api/dao/[daoId]/token/[tokenId]/metadata.json/route.ts

export async function GET(
  req: Request,
  { params }: { params: { daoId: string; tokenId: string } }
) {
  const dao = await getDeployment(params.daoId)
  const seed = await tokenContract.getTokenSeed(params.tokenId)
  const config = await metadataRegistry.getConfig()
  const owner = await tokenContract.ownerOf(params.tokenId)

  // Resolve trait names from seed indexes
  const traits = resolveTraitNames(seed, config)

  return Response.json({
    name: `${dao.name} #${params.tokenId}`,
    description: `A member of ${dao.name} DAO`,
    image: `${BASE_URL}/dao/${params.daoId}/token/${params.tokenId}/image.png`,
    attributes: traits.map(t => ({
      trait_type: t.displayName,
      value: t.name,
    })),
    owner: owner,
  })
}
```

## Governance-Controlled Updates

### Metadata Version History

```sql
-- Database schema for metadata versions
CREATE TABLE metadata.versions (
  deployment_id TEXT NOT NULL,
  version INT NOT NULL,
  ipfs_base_uri TEXT NOT NULL,
  renderer_base_url TEXT NOT NULL,
  trait_counts JSONB NOT NULL,
  activated_at TIMESTAMP NOT NULL,
  proposal_id INT, -- Governance proposal that approved this
  PRIMARY KEY (deployment_id, version)
);
```

### Trait Compatibility Validation

```typescript
// Before allowing metadata update proposal
function validateMetadataUpdate(
  currentConfig: MetadataConfig,
  newConfig: MetadataConfig
): ValidationResult {
  // Rule: Trait counts can only INCREASE, never decrease
  // (Ensures existing seeds don't reference missing traits)

  for (const [trait, currentCount] of Object.entries(currentConfig.trait_count)) {
    const newCount = newConfig.trait_count[trait]

    if (newCount < currentCount) {
      return {
        valid: false,
        error: `Trait "${trait}" count cannot decrease (${currentCount} → ${newCount})`
      }
    }
  }

  // Rule: Trait names must be stable
  const currentTraits = Object.keys(currentConfig.trait_count)
  const newTraits = Object.keys(newConfig.trait_count)

  for (const trait of currentTraits) {
    if (!newTraits.includes(trait)) {
      return {
        valid: false,
        error: `Trait "${trait}" cannot be removed`
      }
    }
  }

  return { valid: true }
}
```

## IPFS Upload & Pinning (Frontend)

### Creation Flow

```typescript
// Step 1 of DAO creation: Upload artwork

interface ArtworkUploadState {
  status: 'idle' | 'validating' | 'uploading' | 'pinning' | 'complete' | 'error'
  files: File[] // User-selected layer files
  preview: ArtSeed[] // Preview seeds
  cid?: string // Final IPFS CID
  error?: string
}

async function uploadArtwork(files: File[]): Promise<string> {
  // 1. Validate folder structure
  const validation = validateArtworkStructure(files)
  if (!validation.valid) throw new Error(validation.error)

  // 2. Upload to IPFS (via server-side API with credentials)
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))

  const response = await fetch('/api/ipfs/upload', {
    method: 'POST',
    body: formData,
  })

  const { cid } = await response.json()

  // 3. Pin to ensure persistence
  await fetch('/api/ipfs/pin', {
    method: 'POST',
    body: JSON.stringify({ cid }),
  })

  // 4. Return CID for DAO creation
  return cid
}
```

### Server-Side IPFS Service

```typescript
// apps/web/src/app/api/ipfs/upload/route.ts

import { create } from 'ipfs-http-client'

// IMPORTANT: Keep credentials server-side
const ipfs = create({
  host: process.env.IPFS_HOST,
  port: parseInt(process.env.IPFS_PORT || '5001'),
  protocol: 'https',
  headers: {
    authorization: `Bearer ${process.env.IPFS_API_KEY}`,
  },
})

export async function POST(req: Request) {
  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  // Upload folder to IPFS
  const results = []
  for await (const result of ipfs.addAll(files, { wrapWithDirectory: true })) {
    results.push(result)
  }

  const rootCid = results.find(r => r.path === '')?.cid.toString()

  return Response.json({ cid: rootCid })
}
```

## Draft Persistence & Cleanup

### Creation Draft Storage

```typescript
interface CreationDraft {
  id: string // UUID
  createdAt: number
  updatedAt: number
  step: number
  artworkCid?: string
  metadata: {
    name: string
    symbol: string
    description: string
  }
  governance: { /* settings */ }
  auction: { /* settings */ }
  founders: { /* allocation */ }
}

// Persist in localStorage, scoped to creator address
const DRAFTS_KEY = (address: string) => `dao-drafts:${address}`

// Cleanup: Remove drafts older than 30 days
// Cleanup: Keep artwork CID if used by deployed DAO
```

## Preview & Validation

### Artwork Preview (Creation Step 1)

```typescript
// Generate preview tokens before upload
function generatePreviews(files: File[], count = 5): Promise<PreviewToken[]> {
  // Parse uploaded files to extract trait counts
  const traitCounts = parseTraitCounts(files)

  // Generate random seeds
  const seeds = Array.from({ length: count }, (_, i) =>
    generateSeed(i, traitCounts)
  )

  // Composite images from uploaded files (client-side)
  return Promise.all(seeds.map(seed =>
    compositePreview(files, seed)
  ))
}
```

### Validation Rules

```typescript
function validateArtworkStructure(files: File[]): ValidationResult {
  // 1. Check for manifest.json
  const manifest = files.find(f => f.name === 'manifest.json')
  if (!manifest) return { valid: false, error: 'Missing manifest.json' }

  // 2. Validate manifest schema
  const manifestData = JSON.parse(await manifest.text())
  if (!manifestData.traits) return { valid: false, error: 'Invalid manifest' }

  // 3. Check all referenced files exist
  for (const trait of manifestData.traits) {
    for (const file of trait.files) {
      const exists = files.some(f => f.webkitRelativePath.endsWith(file.file))
      if (!exists) return { valid: false, error: `Missing file: ${file.file}` }
    }
  }

  // 4. Validate image formats
  const validFormats = ['.png', '.jpg', '.jpeg', '.svg']
  const invalidFiles = files.filter(f =>
    !validFormats.some(ext => f.name.endsWith(ext)) && f.name !== 'manifest.json'
  )
  if (invalidFiles.length > 0) {
    return { valid: false, error: `Invalid file formats: ${invalidFiles.map(f => f.name).join(', ')}` }
  }

  // 5. Check dimensions consistency (if specified)
  // ... additional validation

  return { valid: true }
}
```

## Questions for User

**Please provide artwork examples so we can document**:

1. **Sample IPFS folder structure**: Full directory tree with actual trait files
2. **Manifest.json example**: Complete, working manifest from a deployed DAO
3. **Trait naming conventions**: How are files named? (e.g., `0-cool.png`, `cool-0.png`, `cool.png`?)
4. **Image requirements**: Dimensions, formats (PNG/SVG?), transparency rules
5. **Trait count limits**: Any maximum number of traits per category?
6. **Trait category requirements**: Required categories (background, body, etc.) vs optional?
7. **Seed generation approach**: Any existing algorithm we should match?
8. **Rarity weighting**: Uniform distribution OK, or weighted rarity needed?

## Implementation Checklist (Phase 1 - Week 1)

Once examples are provided:

- [ ] Document exact IPFS folder structure
- [ ] Document manifest.json schema
- [ ] Create fixture artwork set for testing
- [ ] Define seed generation algorithm
- [ ] Specify trait compatibility rules
- [ ] Document validation requirements
- [ ] Create TypeScript types for artwork data structures
- [ ] Plan preview rendering approach
- [ ] Specify caching strategy

## Implementation Checklist (Phase 5 - Week 15)

When implementing IPFS upload:

- [ ] Server-side IPFS upload route
- [ ] Client-side file selection UI
- [ ] Folder structure validation
- [ ] Preview generation (5 sample tokens)
- [ ] Upload progress indicator
- [ ] Pinning service integration
- [ ] Draft persistence (artwork CID)
- [ ] Cleanup of unused uploads
- [ ] Error handling (upload failures, network issues)

## Implementation Checklist (Phase 7 - Week 17)

When implementing token rendering:

- [ ] Token image API route (`/dao/[daoId]/token/[tokenId]/image.png`)
- [ ] Token metadata API route (`/dao/[daoId]/token/[tokenId]/metadata.json`)
- [ ] Seed storage in token contract
- [ ] Metadata config in MetadataRegistry contract
- [ ] IPFS layer fetching and caching
- [ ] Image compositing (server-side)
- [ ] Trait name resolution
- [ ] Metadata update proposals
- [ ] Trait compatibility validation
- [ ] Version history tracking

---

**Status**: 🔴 Blocked - Awaiting artwork examples from user

**Next Step**: User to share IPFS artwork examples, then update this document with exact specifications.

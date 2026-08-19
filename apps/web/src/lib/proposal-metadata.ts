export type ProposalMetadata = {
  title: string;
  description: string;
  url: string;
};

export type ProposalMetadataDraft = {
  title: string;
  description: string;
  url?: string;
};

function normalizeTitle(value: unknown) {
  const title = typeof value === 'string' ? value.trim() : '';
  return title || 'No Title';
}

function normalizeDescription(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMetadata(value: Partial<ProposalMetadata> | null | undefined): ProposalMetadata | null {
  if (!value || (typeof value.title === 'undefined' && typeof value.description === 'undefined' && typeof value.url === 'undefined')) {
    return null;
  }

  return {
    title: normalizeTitle(value.title),
    description: normalizeDescription(value.description),
    url: normalizeUrl(value.url)
  };
}

export function encodeProposalMetadata(metadata: ProposalMetadataDraft) {
  return JSON.stringify({
    title: normalizeTitle(metadata.title),
    description: normalizeDescription(metadata.description),
    url: normalizeUrl(metadata.url)
  });
}

export function decodeProposalMetadata(value: string): ProposalMetadata | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return normalizeMetadata(parsed as Partial<ProposalMetadata>);
  } catch {
    return null;
  }
}

export function parseProposalMetadata(value: string): ProposalMetadata {
  return decodeProposalMetadata(value) ?? {
    title: 'No Title',
    description: value,
    url: ''
  };
}

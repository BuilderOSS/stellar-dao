'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NetworkName } from '@/lib/stellar';
import type { ActionGroup, ContractActionName } from '@/lib/tx';

export type TransactionHandoffStatus = 'draft' | 'pending-signatures' | 'ready-to-submit' | 'submitted' | 'error';

export type TransactionHandoff = {
  id: string;
  network: NetworkName;
  contractId: string;
  actionId: ContractActionName;
  actionTitle: string;
  group: ActionGroup;
  draft: Record<string, string>;
  previewJson: string;
  previewXdr: string;
  previewResult: string;
  requiredSigners: string[];
  signedBy: string[];
  signedXdr: string;
  signerCount: number;
  isReadCall: boolean;
  status: TransactionHandoffStatus;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
};

type UpsertHandoffInput = {
  id: string;
  network: NetworkName;
  contractId: string;
  actionId: ContractActionName;
  actionTitle: string;
  group: ActionGroup;
  draft: Record<string, string>;
};

type PreviewInput = UpsertHandoffInput & {
  previewJson: string;
  previewXdr: string;
  previewResult: string;
  requiredSigners: string[];
  signerCount: number;
  isReadCall: boolean;
};

type TransactionHandoffStore = {
  handoffs: Record<string, TransactionHandoff>;
  saveDraft: (input: UpsertHandoffInput) => void;
  savePreview: (input: PreviewInput) => void;
  recordSignature: (id: string, signer: string, signedXdr: string) => void;
  markSubmitted: (id: string, message: string) => void;
  markError: (id: string, message: string) => void;
  resetHandoff: (id: string) => void;
  clearHandoff: (id: string) => void;
  clearAll: () => void;
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

function mergeUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildHandoff(input: PreviewInput, current?: TransactionHandoff): TransactionHandoff {
  const now = new Date().toISOString();
  const requiredSigners = mergeUnique(input.requiredSigners);
  return {
    id: input.id,
    network: input.network,
    contractId: input.contractId,
    actionId: input.actionId,
    actionTitle: input.actionTitle,
    group: input.group,
    draft: input.draft,
    previewJson: input.previewJson,
    previewXdr: input.previewXdr,
    previewResult: input.previewResult,
    requiredSigners,
    signedBy: current?.signedBy ?? [],
    signedXdr: current?.signedXdr ?? '',
    signerCount: input.signerCount,
    isReadCall: input.isReadCall,
    status: input.signerCount > 0 ? 'pending-signatures' : 'draft',
    lastMessage: current?.lastMessage ?? '',
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
}

export const useTransactionHandoffStore = create<TransactionHandoffStore>()(
  persist(
    (set) => ({
      handoffs: {},
      saveDraft: (input) =>
        set((current) => {
          const existing = current.handoffs[input.id];
          return {
            handoffs: {
              ...current.handoffs,
              [input.id]: existing
                ? {
                    ...existing,
                    network: input.network,
                    contractId: input.contractId,
                    actionId: input.actionId,
                    actionTitle: input.actionTitle,
                    group: input.group,
                    draft: input.draft,
                    updatedAt: new Date().toISOString(),
                    previewJson: '',
                    previewXdr: '',
                    previewResult: '',
                    requiredSigners: [],
                    signedBy: [],
                    signedXdr: '',
                    signerCount: 0,
                    isReadCall: false,
                    status: 'draft',
                    lastMessage: 'Draft updated'
                  }
                : {
                    id: input.id,
                    network: input.network,
                    contractId: input.contractId,
                    actionId: input.actionId,
                    actionTitle: input.actionTitle,
                    group: input.group,
                    draft: input.draft,
                    previewJson: '',
                    previewXdr: '',
                    previewResult: '',
                    requiredSigners: [],
                    signedBy: [],
                    signedXdr: '',
                    signerCount: 0,
                    isReadCall: false,
                    status: 'draft',
                    lastMessage: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  }
            }
          };
        }),
      savePreview: (input) =>
        set((current) => {
          const handoff = buildHandoff(input, current.handoffs[input.id]);
          return {
            handoffs: {
              ...current.handoffs,
              [input.id]: handoff
            }
          };
        }),
      recordSignature: (id, signer, signedXdr) =>
        set((current) => {
          const existing = current.handoffs[id];
          if (!existing) return current;

          const signedBy = mergeUnique([...existing.signedBy, signer]);
          const updated: TransactionHandoff = {
            ...existing,
            signedBy,
            signedXdr,
            status: existing.requiredSigners.every((required) => signedBy.includes(required))
              ? 'ready-to-submit'
              : 'pending-signatures',
            updatedAt: new Date().toISOString(),
            lastMessage: `Signed by ${signer}`
          };

          return { handoffs: { ...current.handoffs, [id]: updated } };
        }),
      markSubmitted: (id, message) =>
        set((current) => {
          const existing = current.handoffs[id];
          if (!existing) return current;

          return {
            handoffs: {
              ...current.handoffs,
              [id]: {
                ...existing,
                status: 'submitted',
                lastMessage: message,
                updatedAt: new Date().toISOString()
              }
            }
          };
        }),
      markError: (id, message) =>
        set((current) => {
          const existing = current.handoffs[id];
          if (!existing) return current;

          return {
            handoffs: {
              ...current.handoffs,
              [id]: {
                ...existing,
                status: 'error',
                lastMessage: message,
                updatedAt: new Date().toISOString()
              }
            }
          };
        }),
      resetHandoff: (id) =>
        set((current) => {
          const existing = current.handoffs[id];
          if (!existing) return current;

          return {
            handoffs: {
              ...current.handoffs,
              [id]: {
                ...existing,
                previewJson: '',
                previewXdr: '',
                previewResult: '',
                requiredSigners: [],
                signedBy: [],
                signedXdr: '',
                signerCount: 0,
                isReadCall: false,
                status: 'draft',
                lastMessage: '',
                updatedAt: new Date().toISOString()
              }
            }
          };
        }),
      clearHandoff: (id) =>
        set((current) => {
          const next = { ...current.handoffs };
          delete next[id];
          return { handoffs: next };
        }),
      clearAll: () => set({ handoffs: {} })
    }),
    {
      name: 'punch-arena.transaction-handoffs.v1',
      storage,
      partialize: (state) => ({ handoffs: state.handoffs })
    }
  )
);

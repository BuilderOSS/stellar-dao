'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { NetworkName } from '@/lib/stellar';
import type { ActionRecord } from '@/lib/tx';

export type DashboardTab = 'overview' | 'account' | 'actions' | 'dev';

export type DashboardSessionState = {
  network: NetworkName;
  address: string;
  status: string;
  syncedAt: string;
  activeTab: DashboardTab;
  history: ActionRecord[];
};

type DashboardSessionActions = {
  updateSession: (patch: Partial<DashboardSessionState>) => void;
  recordAction: (record: ActionRecord) => void;
  resetHistory: () => void;
};

type DashboardSessionStore = DashboardSessionState & DashboardSessionActions;

const initialState: DashboardSessionState = {
  network: 'local',
  address: '',
  status: 'Disconnected',
  syncedAt: '',
  activeTab: 'overview',
  history: []
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};

const storage = createJSONStorage(() => (typeof window === 'undefined' ? memoryStorage : window.localStorage));

export const useDashboardSessionStore = create<DashboardSessionStore>()(
  persist(
    (set) => ({
      ...initialState,
      updateSession: (patch) => set((current) => ({ ...current, ...patch })),
      recordAction: (record) =>
        set((current) => ({
          ...current,
          history: [record, ...current.history].slice(0, 20),
          status: record.summary
        })),
      resetHistory: () => set((current) => ({ ...current, history: [] }))
    }),
    {
      name: 'punch-arena.session.v1',
      storage,
      partialize: (state) => ({
        network: state.network,
        address: state.address,
        status: state.status,
        syncedAt: state.syncedAt,
        activeTab: state.activeTab,
        history: state.history
      })
    }
  )
);

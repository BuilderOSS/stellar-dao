'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ActionRecord } from '@/lib/tx';

export type DashboardTab = 'overview' | 'account' | 'actions' | 'dev';

export type DashboardSessionState = {
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
      updateSession: (patch) =>
        set((current) => {
          let changed = false;
          const next = { ...current };

          for (const [key, value] of Object.entries(patch) as Array<[
            keyof DashboardSessionState,
            DashboardSessionState[keyof DashboardSessionState]
          ]>) {
            if (typeof value !== 'undefined' && next[key] !== value) {
              next[key] = value as never;
              changed = true;
            }
          }

          return changed ? next : current;
        }),
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
        address: state.address,
        status: state.status,
        syncedAt: state.syncedAt,
        activeTab: state.activeTab,
        history: state.history
      })
    }
  )
);

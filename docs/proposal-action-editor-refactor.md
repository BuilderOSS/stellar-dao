# Proposal Action Editor Refactoring Plan (REVISED v2 - with Zustand)

## Senior React Engineer's Architecture Plan: Scalable Action Editor

### 🎯 Goals
1. Support 10+ action types with increasingly complex forms
2. Each action type self-contained and independently maintainable
3. Fix editing UX: preserve original action in queue when editing
4. Make adding new action types require ZERO changes to existing code
5. Maintain type safety and validation rigor
6. Ensure accessibility, performance, and error resilience
7. **Enable prepopulation from anywhere** (treasury buttons, templates, deep links)
8. **Persist drafts** to prevent data loss

---

## 📁 New File Structure

```
src/
├── stores/
│   ├── dao-session-store.ts           # Existing - wallet session
│   └── proposal-composer-store.ts     # NEW - proposal creation state
├── lib/proposal-actions/
│   ├── index.ts                       # Public API exports
│   ├── types.ts                       # Complete type definitions
│   ├── registry.ts                    # Explicit action registration
│   ├── context.tsx                    # React Context for shared data (read-only)
│   ├── base/
│   │   ├── action-handler.ts          # Base interface all actions implement
│   │   └── validators.ts              # Shared validation utilities
│   ├── actions/
│   │   ├── mint-governance-token/
│   │   │   ├── index.ts               # Exports handler
│   │   │   ├── types.ts               # Action-specific types
│   │   │   ├── component.tsx          # Form fields component
│   │   │   ├── validator.ts           # Validation logic
│   │   │   └── builder.ts             # Call vector builder
│   │   ├── batch-mint-governance-token/
│   │   │   └── ...
│   │   └── transfer-sac-token/
│   │       └── ...
│   └── components/
│       ├── action-form-wrapper.tsx    # Generic wrapper (replaces proposal-action-editor.tsx)
│       ├── action-form-shell.tsx      # Chrome (card, buttons, action type selector)
│       └── action-error-boundary.tsx  # Error boundary for action forms
```

### State Architecture

**Zustand Store (proposal-composer-store.ts):**
- Wizard state (step 1/2/3)
- Proposal metadata (title, description, URL)
- Actions queue
- Current editing state (non-destructive)
- UI feedback (formMessage, busy)
- Prepopulation tracking

**React Context (ActionFormContext):**
- Config (read-only, from props)
- Session (read-only, from props)
- Treasury balances (fetched data)
- Other shared read-only data

**Local Component State:**
- Validation errors (ephemeral)
- UI-only state (accordion open/closed, etc.)

---

## 🔧 Complete Type Definitions

```typescript
// src/lib/proposal-actions/types.ts

import type { DaoNetworkConfig } from '@/lib/dao-config';
import type { AssetBalance } from '@/lib/treasury-queries';

/**
 * All supported proposal action types
 * Add new types here when adding new action handlers
 */
export type ProposalActionType =
  | 'mint-governance-token'
  | 'batch-mint-governance-token'
  | 'transfer-sac-token'
  | 'update-voting-settings'; // Example of future action type

/**
 * Queued action structure (persisted in store)
 */
export interface ProposalQueuedAction {
  id: string;
  type: ProposalActionType;
  recipient: string;
  amount: string;
  // Action-specific fields (discriminated union approach)
  assetCode?: string;
  assetContractId?: string;
  votingDelay?: string;
  votingPeriod?: string;
  quorumNumerator?: string;
  [key: string]: any; // Allow extension
}

/**
 * Validation result structure
 */
export type ValidationResult =
  | { valid: true }
  | {
      valid: false;
      message: string;
      fields?: Record<string, string>; // Field-specific errors
    };

/**
 * Context provided to all action handlers
 */
export interface FormContext {
  config: DaoNetworkConfig;
  session: {
    address: string | null;
    kit: any; // StellarWalletsKit instance
  };
  // Shared data
  balances?: AssetBalance[];
  balancesLoading?: boolean;
  // Allow custom extensions per action type
  [key: string]: any;
}

/**
 * Context for building call vectors
 */
export interface BuildContext {
  config: DaoNetworkConfig;
  governorContractId: string;
  tokenContractId: string;
  treasuryAddress: string;
  treasuryAssets: Array<{
    code: string;
    contractId?: string;
    issuer?: string;
    isNative?: boolean;
  }>;
}

/**
 * Result of building a call vector
 */
export interface CallVectorResult {
  target: string;
  function: string;
  args: any[]; // Encoded SC values
}

/**
 * Props for action-specific form components
 */
export interface ActionFormProps<TData> {
  value: TData;
  onChange: (value: TData) => void;
  disabled: boolean;
  validationErrors?: ValidationResult;
}

/**
 * Core action handler interface
 */
export interface ActionHandler<TData = any> {
  // Metadata
  type: ProposalActionType;
  label: string;
  description: string;
  order?: number; // Display order in dropdown (default: 0)
  group?: string; // Grouping (e.g., "Treasury", "Governance")

  // Form component
  FormComponent: React.ComponentType<ActionFormProps<TData>>;

  // Data lifecycle
  getDefaultValues: () => TData;
  validate: (data: TData, context: FormContext) => ValidationResult;
  serialize: (data: TData, context: FormContext) => ProposalQueuedAction;
  deserialize: (action: ProposalQueuedAction) => TData;

  // Call building
  buildCallVector: (data: TData, context: BuildContext) => CallVectorResult;

  // Optional metadata
  requiresMintAuthority?: boolean;
}

/**
 * Editing state
 */
export type EditingState = {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  index?: number; // Index in queue when editing
  draftData: any; // Current form data
};
```

---

## 🏗️ Key Architectural Components

### 1. Zustand Store for Proposal Composition

**Complete implementation following the existing `dao-session-store.ts` pattern:**

```typescript
// src/stores/proposal-composer-store.ts

'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import type { ProposalActionType, ProposalQueuedAction } from '@/lib/proposal-actions/types';

/**
 * Proposal metadata
 */
type ProposalMetadata = {
  title: string;
  description: string;
  url: string;
};

/**
 * Editing state for non-destructive editing
 */
type EditingState = {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  index?: number;
  draftData: any;
};

/**
 * State
 */
type ProposalComposerState = {
  step: 1 | 2 | 3;
  metadata: ProposalMetadata;
  queuedActions: ProposalQueuedAction[];
  editingState: EditingState | null;
  validationErrors: ValidationResult | null;
  formMessage: string;
  busy: boolean;
  prepopulatedFrom?: string; // Analytics tracking
};

/**
 * Actions
 */
type ProposalComposerActions = {
  // Wizard
  setStep: (step: 1 | 2 | 3) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Metadata
  updateMetadata: (patch: Partial<ProposalMetadata>) => void;

  // Action editing
  beginCreate: (actionType?: ProposalActionType) => void;
  beginEdit: (index: number) => void;
  updateDraft: (draftData: any) => void;
  changeActionType: (actionType: ProposalActionType) => void;
  saveAction: (action: ProposalQueuedAction) => void;
  cancelEdit: () => void;

  // Queue management
  removeAction: (index: number) => void;
  reorderActions: (fromIndex: number, toIndex: number) => void;

  // Prepopulation (KEY FEATURE)
  prepopulate: (data: {
    metadata?: Partial<ProposalMetadata>;
    actions?: ProposalQueuedAction[];
    step?: 1 | 2 | 3;
    source?: string;
  }) => void;

  // Validation
  setValidationErrors: (errors: ValidationResult | null) => void;
  clearValidationErrors: () => void;

  // UI feedback
  setFormMessage: (message: string) => void;
  clearFormMessage: () => void;
  setBusy: (busy: boolean) => void;

  // Reset
  reset: () => void;
  resetDraft: () => void;
};

type ProposalComposerStore = ProposalComposerState & ProposalComposerActions;

const initialState: ProposalComposerState = {
  step: 1,
  metadata: { title: '', description: '', url: '' },
  queuedActions: [],
  editingState: null,
  validationErrors: null,
  formMessage: '',
  busy: false,
  prepopulatedFrom: undefined,
};

const memoryStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined,
};

const storage = createJSONStorage(() =>
  typeof window === 'undefined' ? memoryStorage : window.localStorage
);

export const useProposalComposerStore = create<ProposalComposerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Wizard navigation
      setStep: (step) => set({ step }),
      nextStep: () => set((state) => ({ step: Math.min(3, state.step + 1) as 1 | 2 | 3 })),
      prevStep: () => set((state) => ({ step: Math.max(1, state.step - 1) as 1 | 2 | 3 })),

      // Metadata
      updateMetadata: (patch) =>
        set((state) => ({ metadata: { ...state.metadata, ...patch } })),

      // Action editing
      beginCreate: (actionType = 'mint-governance-token') => {
        const handler = getActionHandler(actionType);
        set({
          editingState: {
            mode: 'create',
            actionType,
            draftData: handler.getDefaultValues(),
          },
        });
      },

      beginEdit: (index) => {
        const { queuedActions } = get();
        const action = queuedActions[index];
        if (!action) return;

        const handler = getActionHandler(action.type);
        set({
          editingState: {
            mode: 'edit',
            actionType: action.type,
            index,
            draftData: handler.deserialize(action),
          },
        });
      },

      updateDraft: (draftData) =>
        set((state) => {
          if (!state.editingState) return state;
          return { editingState: { ...state.editingState, draftData } };
        }),

      changeActionType: (actionType) => {
        const handler = getActionHandler(actionType);
        set((state) => {
          if (!state.editingState) return state;
          return {
            editingState: {
              ...state.editingState,
              actionType,
              draftData: handler.getDefaultValues(),
            },
          };
        });
      },

      saveAction: (action) =>
        set((state) => {
          const { editingState, queuedActions } = state;
          if (!editingState) return state;

          if (editingState.mode === 'edit' && editingState.index !== undefined) {
            const nextActions = [...queuedActions];
            nextActions[editingState.index] = action;
            return {
              queuedActions: nextActions,
              editingState: null,
              formMessage: 'Action updated',
            };
          } else {
            return {
              queuedActions: [...queuedActions, action],
              editingState: null,
              formMessage: 'Action added',
            };
          }
        }),

      cancelEdit: () => set({ editingState: null, formMessage: '' }),

      // Queue management
      removeAction: (index) =>
        set((state) => {
          const nextActions = [...state.queuedActions];
          nextActions.splice(index, 1);
          return { queuedActions: nextActions, formMessage: 'Action removed' };
        }),

      reorderActions: (fromIndex, toIndex) =>
        set((state) => {
          const nextActions = [...state.queuedActions];
          const [removed] = nextActions.splice(fromIndex, 1);
          nextActions.splice(toIndex, 0, removed);
          return { queuedActions: nextActions };
        }),

      // Prepopulation
      prepopulate: ({ metadata, actions, step, source }) =>
        set((state) => ({
          metadata: metadata ? { ...state.metadata, ...metadata } : state.metadata,
          queuedActions: actions || state.queuedActions,
          step: step || state.step,
          prepopulatedFrom: source,
        })),

      // Validation
      setValidationErrors: (validationErrors) => set({ validationErrors }),
      clearValidationErrors: () => set({ validationErrors: null }),

      // UI feedback
      setFormMessage: (formMessage) => set({ formMessage }),
      clearFormMessage: () => set({ formMessage: '' }),
      setBusy: (busy) => set({ busy }),

      // Reset
      reset: () => set(initialState),
      resetDraft: () => set({ editingState: null, validationErrors: null }),
    }),
    {
      name: 'dao.proposal-composer.v1',
      storage,
      partialize: (state) => ({
        step: state.step,
        metadata: state.metadata,
        queuedActions: state.queuedActions,
        editingState: state.editingState,
        prepopulatedFrom: state.prepopulatedFrom,
      }),
    }
  )
);

// Selectors for derived state
export const selectCanProceedToStep2 = (state: ProposalComposerStore) =>
  state.metadata.title.trim().length > 0 &&
  state.metadata.description.trim().length > 0 &&
  state.queuedActions.length > 0;

export const selectIsEditing = (state: ProposalComposerStore) =>
  state.editingState?.mode === 'edit';

export const selectEditingIndex = (state: ProposalComposerStore) =>
  state.editingState?.index;

export const selectValidationErrors = (state: ProposalComposerStore) =>
  state.validationErrors;
```

**Key Benefits:**
1. **Prepopulation from anywhere:** Treasury buttons, templates, deep links
2. **Draft persistence:** Auto-saves to localStorage (never lose work)
3. **Analytics tracking:** `prepopulatedFrom` shows which features drive proposal creation
4. **No props drilling:** Components access store directly
5. **Performance:** Selective subscriptions, only re-render what changed
6. **SSR-safe:** Memory storage fallback for server-side rendering

**Usage Examples:**

#### Treasury "Quick Transfer" Button
```typescript
function TreasuryAssetCard({ asset, balance }: { asset: string; balance: string }) {
  const router = useRouter();
  const prepopulate = useProposalComposerStore((s) => s.prepopulate);

  function handleQuickTransfer() {
    prepopulate({
      metadata: {
        title: `Transfer ${asset} from Treasury`,
        description: `Proposal to transfer ${asset} tokens from the DAO treasury.`,
        url: '',
      },
      actions: [{
        id: crypto.randomUUID(),
        type: 'transfer-sac-token',
        recipient: '',
        amount: '',
        assetCode: asset,
        assetContractId: getAssetContractId(asset),
      }],
      step: 1,
      source: `treasury-${asset.toLowerCase()}-quick-transfer`,
    });

    router.push('/proposals/create');
  }

  return <Button onClick={handleQuickTransfer}>Quick Transfer</Button>;
}
```

#### Template System
```typescript
const TEMPLATES = {
  'monthly-airdrop': {
    metadata: {
      title: 'Monthly Community Airdrop',
      description: 'Airdrop governance tokens to active community members.',
    },
    actions: [{ type: 'batch-mint-governance-token', recipient: '', amount: '10' }],
  },
};

function TemplateSelector() {
  const prepopulate = useProposalComposerStore((s) => s.prepopulate);
  const router = useRouter();

  return (
    <Button onClick={() => {
      prepopulate({ ...TEMPLATES['monthly-airdrop'], source: 'template-monthly-airdrop' });
      router.push('/proposals/create');
    }}>
      Use Template
    </Button>
  );
}
```

#### Components (No Props Needed!)
```typescript
// Action queue
function ProposalActionQueue() {
  const queuedActions = useProposalComposerStore((s) => s.queuedActions);
  const editingIndex = useProposalComposerStore(selectEditingIndex);
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const removeAction = useProposalComposerStore((s) => s.removeAction);

  return (
    <>
      {queuedActions.map((action, index) => (
        <ActionCard
          key={action.id}
          action={action}
          isEditing={editingIndex === index}
          onEdit={() => beginEdit(index)}
          onRemove={() => removeAction(index)}
        />
      ))}
    </>
  );
}

// Wizard steps
function ProposalWizard() {
  const step = useProposalComposerStore((s) => s.step);
  const nextStep = useProposalComposerStore((s) => s.nextStep);
  const prevStep = useProposalComposerStore((s) => s.prevStep);

  return (
    <div>
      {step === 1 && <MetadataStep />}
      {step === 2 && <ActionsStep />}
      {step === 3 && <ReviewStep />}
      <Button onClick={prevStep}>Back</Button>
      <Button onClick={nextStep}>Next</Button>
    </div>
  );
}
```

---

### 2. Explicit Registry (No Side Effects)

```typescript
// src/lib/proposal-actions/registry.ts

import { mintGovernanceTokenHandler } from './actions/mint-governance-token';
import { batchMintGovernanceTokenHandler } from './actions/batch-mint-governance-token';
import { transferSacTokenHandler } from './actions/transfer-sac-token';
import type { ActionHandler, ProposalActionType } from './types';

/**
 * Explicit registry - all actions registered in one place
 * NO side effects, NO implicit registration
 */
const REGISTERED_HANDLERS: ActionHandler[] = [
  mintGovernanceTokenHandler,
  batchMintGovernanceTokenHandler,
  transferSacTokenHandler,
];

const ACTION_REGISTRY = new Map<ProposalActionType, ActionHandler>(
  REGISTERED_HANDLERS.map(handler => [handler.type, handler])
);

/**
 * Get handler for a specific action type
 * @throws Error if action type not registered
 */
export function getActionHandler(type: ProposalActionType): ActionHandler {
  const handler = ACTION_REGISTRY.get(type);
  if (!handler) {
    throw new Error(`Unknown action type: ${type}. Did you forget to register it?`);
  }
  return handler;
}

/**
 * Get all registered action types, sorted by order and label
 */
export function getAllActionHandlers(): ActionHandler[] {
  return Array.from(ACTION_REGISTRY.values())
    .sort((a, b) => {
      // Sort by order first, then by label
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.label.localeCompare(b.label);
    });
}

/**
 * Get action types grouped by category
 */
export function getActionHandlersByGroup(): Record<string, ActionHandler[]> {
  const grouped: Record<string, ActionHandler[]> = {};

  for (const handler of ACTION_REGISTRY.values()) {
    const group = handler.group || 'Other';
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(handler);
  }

  return grouped;
}
```

---

### 2. React Context for Shared Data

```typescript
// src/lib/proposal-actions/context.tsx

'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { useTreasuryBalances } from '@/lib/treasury-queries';
import type { FormContext } from './types';

const ActionFormContext = createContext<FormContext | null>(null);

export interface ActionFormProviderProps {
  children: ReactNode;
  config: DaoNetworkConfig;
  session: FormContext['session'];
}

/**
 * Provider for shared action form data
 * Wraps the entire action editor to avoid prop drilling
 */
export function ActionFormProvider({
  children,
  config,
  session
}: ActionFormProviderProps) {
  const { data: balances, isLoading: balancesLoading } = useTreasuryBalances(config);

  const contextValue = useMemo<FormContext>(
    () => ({
      config,
      session,
      balances,
      balancesLoading,
    }),
    [config, session, balances, balancesLoading]
  );

  return (
    <ActionFormContext.Provider value={contextValue}>
      {children}
    </ActionFormContext.Provider>
  );
}

/**
 * Hook to access shared action form context
 */
export function useActionFormContext(): FormContext {
  const context = useContext(ActionFormContext);
  if (!context) {
    throw new Error('useActionFormContext must be used within ActionFormProvider');
  }
  return context;
}
```

---

### 3. ActionFormWrapper (Consumes Zustand Store Directly)

**Architecture Decision:** The wrapper consumes the store directly instead of accepting props. This eliminates props drilling and ensures single source of truth.

```typescript
// src/lib/proposal-actions/components/action-form-wrapper.tsx

'use client';

import { useCallback, Suspense } from 'react';
import { getActionHandler } from '../registry';
import { useActionFormContext } from '../context';
import { useProposalComposerStore, selectValidationErrors } from '@/stores/proposal-composer-store';
import { ActionFormShell } from './action-form-shell';
import { ActionErrorBoundary } from './action-error-boundary';
import { Spinner } from '@/components/ui';

/**
 * ActionFormWrapper consumes Zustand store directly
 * NO PROPS needed - all state comes from store
 */
export function ActionFormWrapper() {
  const context = useActionFormContext();

  // Subscribe to only what we need (performance optimization)
  const editingState = useProposalComposerStore((s) => s.editingState);
  const validationErrors = useProposalComposerStore(selectValidationErrors);
  const busy = useProposalComposerStore((s) => s.busy);

  // Actions
  const updateDraft = useProposalComposerStore((s) => s.updateDraft);
  const saveAction = useProposalComposerStore((s) => s.saveAction);
  const cancelEdit = useProposalComposerStore((s) => s.cancelEdit);
  const changeActionType = useProposalComposerStore((s) => s.changeActionType);
  const setValidationErrors = useProposalComposerStore((s) => s.setValidationErrors);

  const handleSave = useCallback(() => {
    if (!editingState) return;

    const handler = getActionHandler(editingState.actionType);
    const validation = handler.validate(editingState.draftData, context);

    if (!validation.valid) {
      setValidationErrors(validation);
      return;
    }

    const action = handler.serialize(editingState.draftData, context);
    saveAction(action);
    setValidationErrors(null);
  }, [editingState, context, saveAction, setValidationErrors]);

  const handleActionTypeChange = useCallback((newType: ProposalActionType) => {
    if (!editingState) return;

    const handler = getActionHandler(editingState.actionType);
    const hasChanges = JSON.stringify(editingState.draftData) !==
                      JSON.stringify(handler.getDefaultValues());

    if (hasChanges) {
      const confirmed = window.confirm(
        'Switching action type will clear your current draft. Continue?'
      );
      if (!confirmed) return;
    }

    changeActionType(newType);
    setValidationErrors(null);
  }, [editingState, changeActionType, setValidationErrors]);

  const handleCancel = useCallback(() => {
    cancelEdit();
    setValidationErrors(null);
  }, [cancelEdit, setValidationErrors]);

  // No editing state - show empty state
  if (!editingState) {
    return null;
  }

  const handler = getActionHandler(editingState.actionType);
  const FormComponent = handler.FormComponent;

  return (
    <ActionFormShell
      mode={editingState.mode}
      actionType={editingState.actionType}
      actionLabel={handler.label}
      disabled={busy}
      onActionTypeChange={handleActionTypeChange}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      <ActionErrorBoundary actionType={editingState.actionType}>
        <Suspense fallback={<Spinner />}>
          <FormComponent
            value={editingState.draftData}
            onChange={updateDraft}
            disabled={busy}
            validationErrors={validationErrors}
          />
        </Suspense>
      </ActionErrorBoundary>
    </ActionFormShell>
  );
}
```

**Key Improvements:**
- ✅ Zero props - consumes store directly
- ✅ Selective subscriptions (only re-renders when needed data changes)
- ✅ Suspense for lazy-loaded form components
- ✅ Single source of truth (store)
- ✅ Validation state in store (accessible anywhere)

---

### 4. ActionFormShell (UI Chrome)

**Purpose:** Provides the card, buttons, action type selector, and layout chrome for all action forms.

```typescript
// src/lib/proposal-actions/components/action-form-shell.tsx

'use client';

import { Badge, Button, Card, FieldLabel, Select, Text } from '@/components/ui';
import { getAllActionHandlers } from '../registry';
import type { ProposalActionType } from '../types';
import { Stack } from 'styled-system/jsx';
import type { ReactNode } from 'react';

export interface ActionFormShellProps {
  mode: 'create' | 'edit';
  actionType: ProposalActionType;
  actionLabel: string;
  disabled: boolean;
  onActionTypeChange: (type: ProposalActionType) => void;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}

export function ActionFormShell({
  mode,
  actionType,
  actionLabel,
  disabled,
  onActionTypeChange,
  onSave,
  onCancel,
  children,
}: ActionFormShellProps) {
  const allHandlers = getAllActionHandlers();

  return (
    <Card p="5">
      <Stack gap="3">
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'flex-start'
        }}>
          <Stack gap="1">
            <Badge>{mode === 'edit' ? 'Editing' : 'Action builder'}</Badge>
            <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>
              {mode === 'edit' ? 'Edit queued action' : 'Add action'}
            </Text>
          </Stack>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancel edit
            </Button>
          )}
        </div>

        {/* Action Type Selector */}
        <Stack gap="2">
          <FieldLabel htmlFor="proposal-action-type">Action type</FieldLabel>
          <Select
            id="proposal-action-type"
            value={actionType}
            onChange={(event) => onActionTypeChange(event.target.value as ProposalActionType)}
            disabled={disabled}
            aria-label="Action type"
          >
            {allHandlers.map((handler) => (
              <option key={handler.type} value={handler.type}>
                {handler.label}
              </option>
            ))}
          </Select>
          <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
            Each queued action becomes a separate governor call in the final proposal.
          </Text>
        </Stack>

        {/* Form Content (children) */}
        {children}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={disabled}
          >
            Clear draft
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={disabled}
          >
            {mode === 'edit' ? 'Save action' : 'Add action'}
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
```

**Key Features:**
- Badge shows current mode (Editing / Action builder)
- Dynamic action type dropdown (auto-populated from registry)
- Cancel button only shown in edit mode
- Save button label changes based on mode
- All UI chrome in one place - action forms just render fields

---

### 5. Error Boundary

```typescript
// src/lib/proposal-actions/components/action-error-boundary.tsx

'use client';

import { Component, type ReactNode } from 'react';
import { Callout } from '@/components/ui';

interface Props {
  children: ReactNode;
  actionType: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ActionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`Error in ${this.props.actionType} form:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Callout
          variant="error"
          title="Action Form Error"
          description={`There was an error rendering the ${this.props.actionType} form. ${this.state.error?.message || 'Unknown error'}`}
        />
      );
    }

    return this.props.children;
  }
}
```

---

### 5. Example Action Module (Complete)

```typescript
// src/lib/proposal-actions/actions/transfer-sac-token/types.ts

export type TransferSacTokenData = {
  recipient: string;
  amount: string;
  assetCode: string;
};

// src/lib/proposal-actions/actions/transfer-sac-token/validator.ts

import { validateStellarAddress } from '@/lib/validate-address';
import type { ValidationResult, FormContext } from '../../types';
import type { TransferSacTokenData } from './types';

export function validateTransferSacToken(
  data: TransferSacTokenData,
  context: FormContext
): ValidationResult {
  const fields: Record<string, string> = {};

  // Validate recipient
  const recipientValidation = validateStellarAddress(data.recipient);
  if (!recipientValidation.isValid) {
    fields.recipient = recipientValidation.error || 'Invalid address';
  }

  // Validate asset selection
  if (!data.assetCode || data.assetCode.trim().length === 0) {
    fields.assetCode = 'Please select an asset';
  }

  // Validate amount
  const amount = data.amount.trim();
  if (amount.length === 0) {
    fields.amount = 'Amount is required';
  } else if (!/^-?\d+(\.\d+)?$/.test(amount)) {
    fields.amount = 'Invalid amount format';
  } else {
    const numAmount = parseFloat(amount);
    if (numAmount <= 0) {
      fields.amount = 'Amount must be positive';
    } else if (isNaN(numAmount) || !isFinite(numAmount)) {
      fields.amount = 'Invalid amount';
    } else {
      // Check balance
      const balance = context.balances?.find(b => b.assetCode === data.assetCode);
      if (balance && numAmount > parseFloat(balance.balance)) {
        fields.amount = `Amount exceeds balance of ${parseFloat(balance.balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 7
        })} ${data.assetCode}`;
      }
    }
  }

  const hasErrors = Object.keys(fields).length > 0;

  if (hasErrors) {
    return {
      valid: false,
      message: 'Please fix the errors below',
      fields,
    };
  }

  return { valid: true };
}

// src/lib/proposal-actions/actions/transfer-sac-token/component.tsx

import { Stack } from 'styled-system/jsx';
import { FieldLabel, FieldHelperText, Input, Select } from '@/components/ui';
import { useActionFormContext } from '../../context';
import type { ActionFormProps } from '../../types';
import type { TransferSacTokenData } from './types';

export function TransferSacTokenForm({
  value,
  onChange,
  disabled,
  validationErrors,
}: ActionFormProps<TransferSacTokenData>) {
  const context = useActionFormContext();
  const { balances, balancesLoading } = context;

  const selectedBalance = balances?.find(b => b.assetCode === value.assetCode);

  const balanceDisplay = value.assetCode && balances
    ? selectedBalance
      ? `${parseFloat(selectedBalance.balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 7
        })} ${value.assetCode}`
      : `0 ${value.assetCode}`
    : null;

  return (
    <Stack gap="3">
      <Stack gap="2">
        <FieldLabel htmlFor="asset-code">Asset</FieldLabel>
        <Select
          id="asset-code"
          value={value.assetCode}
          onChange={(e) => onChange({ ...value, assetCode: e.target.value })}
          disabled={disabled}
          aria-invalid={!!validationErrors?.fields?.assetCode}
          aria-describedby={validationErrors?.fields?.assetCode ? 'asset-code-error' : undefined}
        >
          <option value="">Select asset...</option>
          <option value="XLM">XLM (Native)</option>
          <option value="USDC">USDC</option>
          <option value="EURC">EURC</option>
        </Select>
        {validationErrors?.fields?.assetCode ? (
          <FieldHelperText id="asset-code-error" style={{ color: 'var(--error-9)' }}>
            {validationErrors.fields.assetCode}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Choose which SAC token to transfer</FieldHelperText>
        )}
        {balanceDisplay && (
          <FieldHelperText>
            <strong>Treasury balance:</strong> {balancesLoading ? 'Loading...' : balanceDisplay}
          </FieldHelperText>
        )}
      </Stack>

      <Stack gap="2">
        <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
        <Input
          id="recipient"
          value={value.recipient}
          onChange={(e) => onChange({ ...value, recipient: e.target.value })}
          placeholder="Recipient address (G... or C...)"
          disabled={disabled}
          aria-invalid={!!validationErrors?.fields?.recipient}
          aria-describedby={validationErrors?.fields?.recipient ? 'recipient-error' : undefined}
        />
        {validationErrors?.fields?.recipient ? (
          <FieldHelperText id="recipient-error" style={{ color: 'var(--error-9)' }}>
            {validationErrors.fields.recipient}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Enter a valid Stellar address</FieldHelperText>
        )}
      </Stack>

      <Stack gap="2">
        <FieldLabel htmlFor="amount">Amount</FieldLabel>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <Input
              id="amount"
              type="number"
              step="0.0000001"
              min="0"
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              placeholder="Amount to transfer"
              disabled={disabled}
              aria-invalid={!!validationErrors?.fields?.amount}
              aria-describedby={validationErrors?.fields?.amount ? 'amount-error' : undefined}
            />
          </div>
          {value.assetCode && selectedBalance && (
            <button
              type="button"
              onClick={() => onChange({ ...value, amount: selectedBalance.balance })}
              disabled={disabled || balancesLoading}
              style={{ whiteSpace: 'nowrap' }}
              className="button-outline"
            >
              Max
            </button>
          )}
        </div>
        {validationErrors?.fields?.amount ? (
          <FieldHelperText id="amount-error" style={{ color: 'var(--error-9)' }}>
            {validationErrors.fields.amount}
          </FieldHelperText>
        ) : (
          <FieldHelperText>Supports up to 7 decimal places</FieldHelperText>
        )}
      </Stack>
    </Stack>
  );
}

// src/lib/proposal-actions/actions/transfer-sac-token/index.ts

import type { ActionHandler } from '../../types';
import { TransferSacTokenForm } from './component';
import { validateTransferSacToken } from './validator';
import type { TransferSacTokenData } from './types';

export const transferSacTokenHandler: ActionHandler<TransferSacTokenData> = {
  type: 'transfer-sac-token',
  label: 'Transfer SAC Token',
  description: 'Transfer tokens from the treasury to a recipient',
  order: 3,
  group: 'Treasury',

  FormComponent: TransferSacTokenForm,

  getDefaultValues: () => ({
    recipient: '',
    amount: '',
    assetCode: '',
  }),

  validate: validateTransferSacToken,

  serialize: (data, context) => {
    const assetConfig = context.config.treasuryAssets?.find(
      a => a.code === data.assetCode
    );

    return {
      id: crypto.randomUUID(),
      type: 'transfer-sac-token',
      recipient: data.recipient.trim(),
      amount: data.amount.trim(),
      assetCode: data.assetCode,
      assetContractId: assetConfig?.contractId,
    };
  },

  deserialize: (action) => ({
    recipient: action.recipient || '',
    amount: action.amount || '',
    assetCode: action.assetCode || '',
  }),

  buildCallVector: (data, context) => {
    const assetConfig = context.treasuryAssets.find(a => a.code === data.assetCode);
    if (!assetConfig?.contractId) {
      throw new Error(`No contract ID for asset: ${data.assetCode}`);
    }

    // Convert decimal to stroops (multiply by 10^7)
    const stroops = BigInt(Math.round(parseFloat(data.amount) * 10_000_000));

    return {
      target: assetConfig.contractId,
      function: 'transfer',
      args: [
        // from (treasury address)
        // to (recipient address)
        // amount (i128)
        // ... encode properly using stellar-sdk
      ],
    };
  },

  requiresMintAuthority: false,
};
```

---

## 🔄 Non-Destructive Editing Implementation

**The entire editing flow is managed by the Zustand store.** Parent component only needs to render components:

```typescript
// In proposals/create/page.tsx

'use client';

import { useProposalComposerStore, selectEditingIndex } from '@/stores/proposal-composer-store';
import { ActionFormProvider } from '@/lib/proposal-actions/context';
import { ActionFormWrapper } from '@/lib/proposal-actions/components/action-form-wrapper';
import { ProposalActionQueue } from '@/components/proposal/proposal-action-queue';

export default function ProposalCreatePage() {
  const config = useDaoNetworkConfig();
  const session = useDaoSession();

  // Only subscribe to what triggers re-render
  const editingState = useProposalComposerStore((s) => s.editingState);
  const editingIndex = useProposalComposerStore(selectEditingIndex);

  // Actions (stable references, won't cause re-renders)
  const beginCreate = useProposalComposerStore((s) => s.beginCreate);
  const beginEdit = useProposalComposerStore((s) => s.beginEdit);
  const removeAction = useProposalComposerStore((s) => s.removeAction);

  return (
    <ActionFormProvider config={config} session={session}>
      <div>
        {/* Action Form - consumes store directly */}
        {!editingState && (
          <Button onClick={() => beginCreate()}>
            Add Action
          </Button>
        )}
        <ActionFormWrapper />

        {/* Action Queue - consumes store directly */}
        <ProposalActionQueue
          onEdit={beginEdit}
          onRemove={removeAction}
          editingIndex={editingIndex}
        />
      </div>
    </ActionFormProvider>
  );
}
```

**ProposalActionQueue component:**

```typescript
// src/components/proposal/proposal-action-queue.tsx

'use client';

import { useProposalComposerStore } from '@/stores/proposal-composer-store';
import { getActionHandler } from '@/lib/proposal-actions/registry';
import { Card, Button, Badge, Text } from '@/components/ui';

interface ProposalActionQueueProps {
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  editingIndex?: number;
}

export function ProposalActionQueue({
  onEdit,
  onRemove,
  editingIndex,
}: ProposalActionQueueProps) {
  const queuedActions = useProposalComposerStore((s) => s.queuedActions);

  if (queuedActions.length === 0) {
    return (
      <Card p="4">
        <Text style={{ color: 'var(--gray-11)' }}>
          No actions queued yet. Add an action above to get started.
        </Text>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {queuedActions.map((action, index) => {
        const handler = getActionHandler(action.type);
        const isEditing = editingIndex === index;

        return (
          <Card
            key={action.id}
            p="4"
            style={{
              border: isEditing ? '2px solid var(--accent-9)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                {isEditing && <Badge style={{ marginBottom: '8px' }}>Editing</Badge>}
                <Text style={{ fontWeight: 600 }}>{handler.label}</Text>
                <Text style={{ fontSize: '0.875rem', color: 'var(--gray-11)' }}>
                  To: {action.recipient}
                  {action.amount && ` • Amount: ${action.amount}`}
                  {action.assetCode && ` ${action.assetCode}`}
                </Text>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(index)}
                  disabled={isEditing}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(index)}
                  disabled={isEditing}
                >
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

**How it works:**
1. User clicks "Edit" → calls `beginEdit(index)` from store
2. Store creates `editingState` with draft copy of the action
3. `ActionFormWrapper` detects `editingState` and renders the form
4. User edits → calls `updateDraft()` from store
5. User clicks "Save" → validates, calls `saveAction()`, updates queue
6. User clicks "Cancel" → calls `cancelEdit()`, original stays in queue unchanged

**Key Benefits:**
- ✅ Original action stays in queue while editing
- ✅ Cancel just clears `editingState` - no data loss
- ✅ Parent component is ~50 lines (down from 659)
- ✅ All state logic in testable store
- ✅ Components subscribe only to what they need

---

## ⚡ Performance Considerations

### Code Splitting with Suspense

**Strategy:** Lazy-load form components (largest code) while keeping handlers loaded immediately (small, needed for validation/serialization).

```typescript
// src/lib/proposal-actions/registry.ts

import { lazy } from 'react';
import type { ActionHandler } from './types';

// Import validators and serializers eagerly (small, needed immediately)
import { validateMintGovernanceToken } from './actions/mint-governance-token/validator';
import { serializeMintGovernanceToken, deserializeMintGovernanceToken } from './actions/mint-governance-token/builder';

// Lazy load form component (largest code, only needed when rendering)
const MintGovernanceTokenForm = lazy(() =>
  import('./actions/mint-governance-token/component')
    .then(m => ({ default: m.MintGovernanceTokenForm }))
);

const mintGovernanceTokenHandler: ActionHandler = {
  type: 'mint-governance-token',
  label: 'Mint Governance Token',
  description: 'Mint new governance tokens to a recipient',
  order: 1,
  group: 'Governance',

  FormComponent: MintGovernanceTokenForm, // Lazy-loaded

  getDefaultValues: () => ({ recipient: '', amount: '1' }),
  validate: validateMintGovernanceToken, // Eager
  serialize: serializeMintGovernanceToken, // Eager
  deserialize: deserializeMintGovernanceToken, // Eager
  buildCallVector: (data, context) => ({ /* ... */ }), // Eager
};
```

**ActionFormWrapper already includes Suspense** (see line 818):

```typescript
<Suspense fallback={<Spinner />}>
  <FormComponent
    value={editingState.draftData}
    onChange={updateDraft}
    disabled={busy}
    validationErrors={validationErrors}
  />
</Suspense>
```

**Benefits:**
- Form components code-split (~5-15kb each)
- Validation logic always available (needed for immediate feedback)
- Spinner shown during lazy load (smooth UX)
- Total initial bundle reduced by ~50-100kb for 10+ action types

### Memoization Guidelines

```typescript
// In action form components, memoize expensive computations
const selectedBalance = useMemo(
  () => balances?.find(b => b.assetCode === value.assetCode),
  [balances, value.assetCode]
);

// Memoize callbacks
const handleMaxClick = useCallback(() => {
  if (selectedBalance) {
    onChange({ ...value, amount: selectedBalance.balance });
  }
}, [selectedBalance, value, onChange]);
```

---

## ♿ Accessibility Requirements

### ARIA Labels and Roles

```typescript
// All form fields must have:
// 1. Proper labels (via htmlFor)
// 2. aria-invalid when errors present
// 3. aria-describedby linking to error messages
// 4. Role announcements for dynamic content

<Input
  id="amount"
  aria-label="Transfer amount"
  aria-invalid={!!validationErrors?.fields?.amount}
  aria-describedby={validationErrors?.fields?.amount ? 'amount-error' : 'amount-helper'}
/>

{validationErrors?.fields?.amount ? (
  <FieldHelperText id="amount-error" role="alert" style={{ color: 'var(--error-9)' }}>
    {validationErrors.fields.amount}
  </FieldHelperText>
) : (
  <FieldHelperText id="amount-helper">
    Supports up to 7 decimal places
  </FieldHelperText>
)}
```

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order must be logical (top to bottom, left to right)
- Escape key should cancel editing
- Enter key in text fields should not submit (only explicit Save button)

---

## 🚨 Anti-Patterns (DO NOT DO)

### ❌ DON'T: Put business logic in form components
```typescript
// BAD
export function TransferSacTokenForm({ value, onChange }) {
  // ❌ Validation logic in component
  const isValid = value.amount > 0 && parseFloat(value.amount) < 1000000;

  // ❌ Serialization logic in component
  const serialize = () => ({
    type: 'transfer-sac-token',
    amount: (parseFloat(value.amount) * 10_000_000).toString()
  });
}

// GOOD - Keep components pure, logic in handlers
export const transferSacTokenHandler = {
  validate: (data) => { /* validation here */ },
  serialize: (data) => { /* serialization here */ },
};
```

### ❌ DON'T: Call hooks conditionally in handlers
```typescript
// BAD
export const badHandler: ActionHandler = {
  FormComponent: ({ value }) => {
    if (value.assetCode) {
      const balance = useBalance(value.assetCode); // ❌ Conditional hook
    }
  }
};

// GOOD - Always call hooks unconditionally
export function TransferSacTokenForm({ value }) {
  const context = useActionFormContext(); // ✅ Always called
  const balance = context.balances?.find(b => b.assetCode === value.assetCode);
}
```

### ❌ DON'T: Mutate context
```typescript
// BAD
export function MyForm({ value, onChange }) {
  const context = useActionFormContext();
  context.customField = 'foo'; // ❌ Mutation
}

// GOOD - Context is read-only
export function MyForm({ value, onChange }) {
  const context = useActionFormContext();
  const customValue = context.customField || 'default'; // ✅ Read-only
}
```

---

## 📋 Revised Migration Steps

### Phase 0: Spike Implementation (2-3 days)
**Goal:** Validate architecture with one complete action type end-to-end

1. Create directory structure (`src/lib/proposal-actions/`, `src/stores/`)
2. Define all TypeScript interfaces
3. **Build Zustand store** (`proposal-composer-store.ts`) following `dao-session-store.ts` pattern
4. Build context provider (for read-only config/balances)
5. Implement registry (with just `mint-governance-token`)
6. Build `ActionFormWrapper` and `ActionFormShell` consuming store
7. Migrate `mint-governance-token` completely
8. Test in isolation with feature flag
9. **Test prepopulation:** Create a simple button that prepopulates the store
10. **Decision point:** Architecture validated? Proceed or adjust?

### Phase 1: Foundation (1-2 days)
11. Finalize base interfaces based on spike learnings
12. Create error boundary component
13. Build shared validation utilities
14. Set up accessibility testing infrastructure
15. Add Zustand DevTools integration

### Phase 2: Migrate Remaining Actions (2-3 days)
16. Migrate `batch-mint-governance-token`
17. Migrate `transfer-sac-token` (most complex - includes balance logic)
18. Test all three in isolation
19. Add unit tests for validators and builders
20. Add unit tests for store actions

### Phase 3: Integration (2-3 days)
21. Update parent component to use store (remove all useState hooks)
22. Implement non-destructive editing UX via store
23. Update `proposal-action-queue` to consume store directly
24. Add edit highlighting based on `selectEditingIndex`
25. Add integration tests
26. Test draft persistence (localStorage)

### Phase 4: Polish & Testing (2 days)
27. Accessibility audit and fixes
28. Performance testing and optimization
29. Error handling edge cases
30. **Test prepopulation from multiple sources** (treasury button, template, URL params)
31. **Verify analytics tracking** (`prepopulatedFrom` field)
32. Documentation and examples

### Phase 5: Deploy (1 day)
33. Feature flag rollout
34. Monitor for errors
35. **Monitor localStorage size** (proposal drafts)
36. Remove old component
37. Close feature flag

**Total Estimate: 9-14 days** (including Zustand store implementation)

---

## 🧪 Testing Strategy

### Unit Tests (per action module)

```typescript
// src/lib/proposal-actions/actions/transfer-sac-token/validator.test.ts

import { describe, it, expect } from 'vitest';
import { validateTransferSacToken } from './validator';

describe('validateTransferSacToken', () => {
  const mockContext = {
    config: { /* ... */ },
    session: { address: 'GXXX...' },
    balances: [
      { assetCode: 'USDC', balance: '1000.00' },
    ],
  };

  it('should pass validation for valid data', () => {
    const result = validateTransferSacToken({
      recipient: 'GXXX...',
      amount: '100',
      assetCode: 'USDC',
    }, mockContext);

    expect(result.valid).toBe(true);
  });

  it('should fail when amount exceeds balance', () => {
    const result = validateTransferSacToken({
      recipient: 'GXXX...',
      amount: '2000',
      assetCode: 'USDC',
    }, mockContext);

    expect(result.valid).toBe(false);
    expect(result.fields?.amount).toContain('exceeds balance');
  });

  // ... more test cases
});
```

### Zustand Store Tests

**Critical:** Store tests ensure state management works correctly, especially with persistence.

```typescript
// src/stores/proposal-composer-store.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useProposalComposerStore } from './proposal-composer-store';
import { getActionHandler } from '@/lib/proposal-actions/registry';

describe('ProposalComposerStore', () => {
  // Clear store and localStorage before each test
  beforeEach(() => {
    useProposalComposerStore.getState().reset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Metadata', () => {
    it('should update metadata', () => {
      const store = useProposalComposerStore.getState();

      store.updateMetadata({ title: 'Test Proposal' });

      expect(store.metadata.title).toBe('Test Proposal');
    });
  });

  describe('Prepopulation', () => {
    it('should prepopulate metadata, actions, and step', () => {
      const store = useProposalComposerStore.getState();

      const mockAction = {
        id: '123',
        type: 'mint-governance-token' as const,
        recipient: 'GXXX...',
        amount: '10',
      };

      store.prepopulate({
        metadata: {
          title: 'Airdrop',
          description: 'Monthly airdrop',
          url: 'https://example.com',
        },
        actions: [mockAction],
        step: 2,
        source: 'template-monthly-airdrop',
      });

      expect(store.metadata.title).toBe('Airdrop');
      expect(store.queuedActions).toHaveLength(1);
      expect(store.queuedActions[0].recipient).toBe('GXXX...');
      expect(store.step).toBe(2);
      expect(store.prepopulatedFrom).toBe('template-monthly-airdrop');
    });
  });

  describe('Non-Destructive Editing', () => {
    it('should preserve original action when editing', () => {
      const store = useProposalComposerStore.getState();

      const originalAction = {
        id: '1',
        type: 'mint-governance-token' as const,
        recipient: 'GXXX...',
        amount: '100',
      };

      // Add action to queue
      store.prepopulate({ actions: [originalAction] });

      // Begin editing
      store.beginEdit(0);

      expect(store.editingState).not.toBeNull();
      expect(store.editingState?.mode).toBe('edit');
      expect(store.editingState?.index).toBe(0);

      // Original still in queue
      expect(store.queuedActions[0]).toEqual(originalAction);

      // Modify draft
      store.updateDraft({ recipient: 'GYYY...', amount: '200' });

      // Original unchanged
      expect(store.queuedActions[0].recipient).toBe('GXXX...');
      expect(store.queuedActions[0].amount).toBe('100');
    });

    it('should update queue when saving edit', () => {
      const store = useProposalComposerStore.getState();

      const originalAction = {
        id: '1',
        type: 'mint-governance-token' as const,
        recipient: 'GXXX...',
        amount: '100',
      };

      store.prepopulate({ actions: [originalAction] });
      store.beginEdit(0);

      const updatedAction = {
        id: '1',
        type: 'mint-governance-token' as const,
        recipient: 'GYYY...',
        amount: '200',
      };

      store.saveAction(updatedAction);

      expect(store.queuedActions[0].recipient).toBe('GYYY...');
      expect(store.queuedActions[0].amount).toBe('200');
      expect(store.editingState).toBeNull();
    });

    it('should restore original when canceling edit', () => {
      const store = useProposalComposerStore.getState();

      const originalAction = {
        id: '1',
        type: 'mint-governance-token' as const,
        recipient: 'GXXX...',
        amount: '100',
      };

      store.prepopulate({ actions: [originalAction] });
      store.beginEdit(0);
      store.updateDraft({ recipient: 'GYYY...', amount: '200' });

      // Cancel
      store.cancelEdit();

      // Original unchanged
      expect(store.queuedActions[0].recipient).toBe('GXXX...');
      expect(store.editingState).toBeNull();
    });
  });

  describe('Action Queue Management', () => {
    it('should add new action when in create mode', () => {
      const store = useProposalComposerStore.getState();

      store.beginCreate('mint-governance-token');

      const newAction = {
        id: '1',
        type: 'mint-governance-token' as const,
        recipient: 'GXXX...',
        amount: '10',
      };

      store.saveAction(newAction);

      expect(store.queuedActions).toHaveLength(1);
      expect(store.queuedActions[0]).toEqual(newAction);
    });

    it('should remove action from queue', () => {
      const store = useProposalComposerStore.getState();

      const action1 = { id: '1', type: 'mint-governance-token' as const, recipient: 'GXXX...', amount: '10' };
      const action2 = { id: '2', type: 'mint-governance-token' as const, recipient: 'GYYY...', amount: '20' };

      store.prepopulate({ actions: [action1, action2] });
      store.removeAction(0);

      expect(store.queuedActions).toHaveLength(1);
      expect(store.queuedActions[0].id).toBe('2');
    });

    it('should reorder actions', () => {
      const store = useProposalComposerStore.getState();

      const action1 = { id: '1', type: 'mint-governance-token' as const, recipient: 'GXXX...', amount: '10' };
      const action2 = { id: '2', type: 'mint-governance-token' as const, recipient: 'GYYY...', amount: '20' };
      const action3 = { id: '3', type: 'mint-governance-token' as const, recipient: 'GZZZ...', amount: '30' };

      store.prepopulate({ actions: [action1, action2, action3] });
      store.reorderActions(0, 2);

      expect(store.queuedActions[0].id).toBe('2');
      expect(store.queuedActions[1].id).toBe('3');
      expect(store.queuedActions[2].id).toBe('1');
    });
  });

  describe('Persistence', () => {
    it('should persist to localStorage', () => {
      const store = useProposalComposerStore.getState();

      store.updateMetadata({ title: 'Test' });
      store.setStep(2);

      // Check localStorage
      const persisted = localStorage.getItem('dao.proposal-composer.v1');
      expect(persisted).not.toBeNull();

      const parsed = JSON.parse(persisted!);
      expect(parsed.state.metadata.title).toBe('Test');
      expect(parsed.state.step).toBe(2);
    });

    it('should NOT persist busy and formMessage', () => {
      const store = useProposalComposerStore.getState();

      store.setBusy(true);
      store.setFormMessage('Test message');

      const persisted = localStorage.getItem('dao.proposal-composer.v1');
      const parsed = JSON.parse(persisted!);

      expect(parsed.state.busy).toBeUndefined();
      expect(parsed.state.formMessage).toBeUndefined();
    });
  });

  describe('Validation', () => {
    it('should set and clear validation errors', () => {
      const store = useProposalComposerStore.getState();

      const errors = {
        valid: false as const,
        message: 'Validation failed',
        fields: { recipient: 'Invalid address' },
      };

      store.setValidationErrors(errors);
      expect(store.validationErrors).toEqual(errors);

      store.clearValidationErrors();
      expect(store.validationErrors).toBeNull();
    });
  });
});
```

### Integration Tests

### E2E Tests (Playwright)

```typescript
// e2e/proposal-actions.spec.ts

import { test, expect } from '@playwright/test';

test('complete proposal creation flow', async ({ page }) => {
  await page.goto('/proposals/create');

  // Add action
  await page.selectOption('[aria-label="Action type"]', 'transfer-sac-token');
  await page.fill('[aria-label="Recipient"]', 'GXXX...');
  await page.fill('[aria-label="Amount"]', '100');
  await page.selectOption('[aria-label="Asset"]', 'USDC');
  await page.click('button:has-text("Add action")');

  // Verify action in queue
  await expect(page.locator('.action-queue')).toContainText('Transfer 100 USDC');

  // Edit action
  await page.click('.action-queue >> button:has-text("Edit")');
  await page.fill('[aria-label="Amount"]', '200');
  await page.click('button:has-text("Save action")');

  // Verify update
  await expect(page.locator('.action-queue')).toContainText('Transfer 200 USDC');
});

test('cancel editing restores original', async ({ page }) => {
  // ... setup ...

  // Start editing
  await page.click('.action-queue >> button:has-text("Edit")');
  await page.fill('[aria-label="Amount"]', '999');

  // Cancel
  await page.click('button:has-text("Cancel")');

  // Original still in queue
  await expect(page.locator('.action-queue')).toContainText('Transfer 100 USDC');
  await expect(page.locator('.action-queue')).not.toContainText('999');
});
```

**Coverage Target:**
- Unit tests: >85%
- Integration tests: Critical paths
- E2E tests: Main user flows

---

## 📈 Success Metrics

### Before (Current State)
- Parent component: **659 lines**
- ProposalActionEditor: **208 lines**
- Props in editor: **30**
- Callbacks: **9**
- Action types: **3**
- Time to add new action: **4-6 hours** (modify 5+ files)

### After (Target State)
- Parent component: **<150 lines**
- ActionFormWrapper: **~80 lines** (generic)
- Props in wrapper: **7**
- Callbacks: **3**
- Action types: **unlimited**
- Time to add new action: **30-60 minutes** (one new folder)

### Quality Gates
1. ✅ Zero TypeScript errors
2. ✅ Zero accessibility violations (axe-core)
3. ✅ >85% test coverage
4. ✅ All existing functionality preserved
5. ✅ Edit + cancel flow works perfectly
6. ✅ Performance: No degradation in form interaction speed

---

## 📝 Complete Example: Adding a New Action Type

```typescript
// 1. Create folder: src/lib/proposal-actions/actions/update-voting-settings/

// 2. Define types (types.ts)
export type UpdateVotingSettingsData = {
  votingDelay: number;  // seconds
  votingPeriod: number; // seconds
  quorumNumerator: string; // basis points
};

// 3. Create validator (validator.ts)
export function validateUpdateVotingSettings(
  data: UpdateVotingSettingsData,
  context: FormContext
): ValidationResult {
  const fields: Record<string, string> = {};

  if (data.votingDelay < 0) {
    fields.votingDelay = 'Voting delay cannot be negative';
  }

  if (data.votingPeriod < 3600) {
    fields.votingPeriod = 'Voting period must be at least 1 hour';
  }

  const quorum = parseInt(data.quorumNumerator);
  if (isNaN(quorum) || quorum < 0 || quorum > 10000) {
    fields.quorumNumerator = 'Quorum must be between 0 and 100%';
  }

  return Object.keys(fields).length > 0
    ? { valid: false, message: 'Please fix errors', fields }
    : { valid: true };
}

// 4. Create component (component.tsx)
import { DurationInput } from '@/components/admin/duration-input';
import { PercentageInput } from '@/components/admin/percentage-input';

export function UpdateVotingSettingsForm({
  value,
  onChange,
  disabled,
  validationErrors,
}: ActionFormProps<UpdateVotingSettingsData>) {
  return (
    <Stack gap="3">
      <DurationInput
        id="voting-delay"
        label="Voting Delay"
        value={value.votingDelay}
        onChange={(votingDelay) => onChange({ ...value, votingDelay })}
        disabled={disabled}
        error={validationErrors?.fields?.votingDelay}
      />

      <DurationInput
        id="voting-period"
        label="Voting Period"
        value={value.votingPeriod}
        onChange={(votingPeriod) => onChange({ ...value, votingPeriod })}
        disabled={disabled}
        error={validationErrors?.fields?.votingPeriod}
      />

      <PercentageInput
        id="quorum"
        label="Quorum Threshold"
        value={value.quorumNumerator}
        onChange={(quorumNumerator) => onChange({ ...value, quorumNumerator })}
        disabled={disabled}
        error={validationErrors?.fields?.quorumNumerator}
      />
    </Stack>
  );
}

// 5. Create handler (index.ts)
export const updateVotingSettingsHandler: ActionHandler<UpdateVotingSettingsData> = {
  type: 'update-voting-settings',
  label: 'Update Voting Settings',
  description: 'Change voting delay, period, or quorum threshold',
  order: 10,
  group: 'Governance',

  FormComponent: UpdateVotingSettingsForm,

  getDefaultValues: () => ({
    votingDelay: 0,
    votingPeriod: 86400,
    quorumNumerator: '500', // 5%
  }),

  validate: validateUpdateVotingSettings,

  serialize: (data, context) => ({
    id: crypto.randomUUID(),
    type: 'update-voting-settings',
    recipient: context.config.governorContractId,
    amount: '0',
    votingDelay: data.votingDelay.toString(),
    votingPeriod: data.votingPeriod.toString(),
    quorumNumerator: data.quorumNumerator,
  }),

  deserialize: (action) => ({
    votingDelay: parseInt(action.votingDelay || '0'),
    votingPeriod: parseInt(action.votingPeriod || '86400'),
    quorumNumerator: action.quorumNumerator || '500',
  }),

  buildCallVector: (data, context) => ({
    target: context.config.governorContractId,
    function: 'update_settings',
    args: [
      // ... encode settings
    ],
  }),

  requiresMintAuthority: false,
};

// 6. Register in registry.ts
import { updateVotingSettingsHandler } from './actions/update-voting-settings';

const REGISTERED_HANDLERS: ActionHandler[] = [
  mintGovernanceTokenHandler,
  batchMintGovernanceTokenHandler,
  transferSacTokenHandler,
  updateVotingSettingsHandler, // ← Add here
];

// Done! Action automatically appears in the dropdown.
```

**Time to implement:** 30-60 minutes
**Files modified in existing code:** 1 (registry.ts)
**Lines changed in existing code:** 1

---

## 🏁 Conclusion

This revised architecture addresses all critical concerns identified in the review:

✅ **No side effects** - Explicit registry registration
✅ **State synchronization** - useEffect syncs initialData changes
✅ **Type safety** - Complete type definitions for all interfaces
✅ **Performance** - React Context, memoization, optional code splitting
✅ **Accessibility** - ARIA labels, keyboard nav, screen reader support
✅ **Error resilience** - Error boundaries, structured validation
✅ **Non-destructive editing** - Original preserved until save
✅ **Testability** - Unit, integration, and E2E test strategies

The architecture scales to 100+ action types without increasing core complexity, and adding a new action type requires touching only 1 line in existing code (the registry).
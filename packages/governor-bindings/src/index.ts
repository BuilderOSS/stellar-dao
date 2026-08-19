import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export type GovernorKey = {tag: "Treasury", values: void} | {tag: "QueueDelay", values: void} | {tag: "Proposal", values: readonly [Buffer]} | {tag: "GovernorAuthority", values: readonly [string]};


export interface ProposalCoreTime {
  eta: u64;
  proposer: string;
  state: ProposalState;
  vote_end: u64;
  vote_snapshot: u32;
  vote_start: u64;
}

/**
 * Errors that can occur in votes operations.
 */
export const VotesError = {
  /**
   * The ledger is in the future
   */
  4100: {message:"FutureLookup"},
  /**
   * Arithmetic overflow occurred
   */
  4101: {message:"MathOverflow"},
  /**
   * Attempting to transfer more voting units than available
   */
  4102: {message:"InsufficientVotingUnits"},
  /**
   * Attempting to delegate to the same delegate that is already set
   */
  4103: {message:"SameDelegate"},
  /**
   * A checkpoint that was expected to exist was not found in storage
   */
  4104: {message:"CheckpointNotFound"}
}




/**
 * Errors that can occur in governor operations.
 */
export const GovernorError = {
  /**
   * The proposal was not found.
   */
  5000: {message:"ProposalNotFound"},
  /**
   * The proposal already exists.
   */
  5001: {message:"ProposalAlreadyExists"},
  /**
   * The proposer does not have enough voting power.
   */
  5002: {message:"InsufficientProposerVotes"},
  /**
   * The proposal contains no actions.
   */
  5003: {message:"EmptyProposal"},
  /**
   * The targets, functions, and args vectors have different lengths.
   */
  5004: {message:"InvalidProposalLength"},
  /**
   * The proposal is not in the active state.
   */
  5005: {message:"ProposalNotActive"},
  /**
   * The proposal has not succeeded.
   */
  5006: {message:"ProposalNotSuccessful"},
  /**
   * The proposal has not been queued.
   */
  5007: {message:"ProposalNotQueued"},
  /**
   * The proposal has already been executed.
   */
  5008: {message:"ProposalAlreadyExecuted"},
  /**
   * The proposal is in a non-cancellable state (`Canceled`, `Expired`, or
   * `Executed`).
   */
  5009: {message:"ProposalNotCancellable"},
  /**
   * The voting delay has not been set.
   */
  5010: {message:"VotingDelayNotSet"},
  /**
   * The voting period has not been set.
   */
  5011: {message:"VotingPeriodNotSet"},
  /**
   * The proposal threshold has not been set.
   */
  5012: {message:"ProposalThresholdNotSet"},
  /**
   * The name has not been set.
   */
  5013: {message:"NameNotSet"},
  /**
   * The version has not been set.
   */
  5014: {message:"VersionNotSet"},
  /**
   * Arithmetic overflow occurred.
   */
  5015: {message:"MathOverflow"},
  /**
   * The account has already voted on this proposal.
   */
  5016: {message:"AlreadyVoted"},
  /**
   * The vote type is invalid (must be 0, 1, or 2).
   */
  5017: {message:"InvalidVoteType"},
  /**
   * The quorum has not been set.
   */
  5018: {message:"QuorumNotSet"},
  /**
   * The token contract has already been set (can only be initialized once).
   */
  5019: {message:"TokenContractAlreadySet"},
  /**
   * The token contract has not been set.
   */
  5020: {message:"TokenContractNotSet"},
  /**
   * The proposal description exceeds the maximum allowed length.
   */
  5021: {message:"DescriptionTooLong"},
  /**
   * Queuing is not enabled for this governor.
   */
  5022: {message:"QueueNotEnabled"}
}

/**
 * The state of a proposal in its lifecycle.
 * 
 * States are divided into two categories:
 * 
 * ## Time-based states (derived, never stored explicitly)
 * 
 * These are computed by [`get_proposal_state()`] from the current ledger
 * relative to the proposal's voting schedule. They are only returned when
 * no explicit state has been set.
 * 
 * - [`Pending`](ProposalState::Pending) — voting has not started yet.
 * - [`Active`](ProposalState::Active) — voting is ongoing.
 * - [`Defeated`](ProposalState::Defeated) — voting ended **without** the
 * counting logic marking the proposal as `Succeeded`.
 * 
 * ## Explicit states
 * 
 * Set explicitly by the Governor or its extensions and persisted in
 * storage. Once set, they take precedence over any time-based derivation.
 * 
 * - [`Canceled`](ProposalState::Canceled) — set by the Governor.
 * - [`Succeeded`](ProposalState::Succeeded) — set by the counting logic.
 * - [`Queued`](ProposalState::Queued) / [`Expired`](ProposalState::Expired) —
 * set by extensions like `TimelockControl`.
 * - [`Executed`](ProposalState::Execu
 */
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Defeated = 2,
  Canceled = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}






/**
 * Errors that can occur in timelock operations.
 */
export const TimelockError = {
  /**
   * The operation is already scheduled
   */
  4000: {message:"OperationAlreadyScheduled"},
  /**
   * The delay is less than the minimum required delay
   */
  4001: {message:"InsufficientDelay"},
  /**
   * The operation is not in the expected state
   */
  4002: {message:"InvalidOperationState"},
  /**
   * A predecessor operation has not been executed yet
   */
  4003: {message:"UnexecutedPredecessor"},
  /**
   * The caller is not authorized to perform this action
   */
  4004: {message:"Unauthorized"},
  /**
   * The minimum delay has not been set
   */
  4005: {message:"MinDelayNotSet"},
  /**
   * The operation has not been scheduled
   */
  4006: {message:"OperationNotScheduled"}
}






/**
 * A checkpoint recording voting power at a specific ledger sequence number.
 */
export interface Checkpoint {
  /**
 * The ledger sequence number when this checkpoint was created
 */
ledger: u32;
  /**
 * The voting power at this ledger sequence number
 */
votes: u128;
}

/**
 * Selects the checkpoint timeline to operate on.
 * 
 * Each variant maps to a different set of storage keys so that
 * per-account voting-power history and aggregate total supply history
 * are kept separate.
 */
export type CheckpointType = {tag: "TotalSupply", values: void} | {tag: "Account", values: readonly [string]};

/**
 * Storage keys for the votes module.
 * 
 * Only delegated voting power counts as votes (i.e., only delegatees can
 * vote), so the storage design tracks delegates and their checkpointed
 * voting power separately from the raw voting units held by each account.
 */
export type VotesStorageKey = {tag: "Delegatee", values: readonly [string]} | {tag: "NumCheckpoints", values: readonly [string]} | {tag: "DelegateCheckpoint", values: readonly [string, u32]} | {tag: "NumTotalSupplyCheckpoints", values: void} | {tag: "TotalSupplyCheckpoint", values: readonly [u32]} | {tag: "VotingUnits", values: readonly [string]};


/**
 * Core proposal data stored on-chain.
 */
export interface ProposalCore {
  /**
 * The address that created the proposal.
 */
proposer: string;
  /**
 * The current state of the proposal.
 */
state: ProposalState;
  /**
 * The last ledger where voting is active (inclusive).
 */
vote_end: u32;
  /**
 * The ledger at which voting power is snapshotted. Voting opens on
 * the next ledger (`vote_snapshot + 1`).
 */
vote_snapshot: u32;
}


/**
 * A quorum checkpoint recording the quorum value at a specific ledger.
 */
export interface QuorumCheckpoint {
  /**
 * The ledger at which this quorum value took effect.
 */
ledger: u32;
  /**
 * The quorum value.
 */
quorum: u128;
}

/**
 * Storage keys for the Governor contract.
 */
export type GovernorStorageKey = {tag: "Name", values: void} | {tag: "Version", values: void} | {tag: "VotingDelay", values: void} | {tag: "VotingPeriod", values: void} | {tag: "ProposalThreshold", values: void} | {tag: "Proposal", values: readonly [Buffer]} | {tag: "NumQuorumCheckpoints", values: void} | {tag: "QuorumCheckpoint", values: readonly [u32]} | {tag: "ProposalVote", values: readonly [Buffer]} | {tag: "HasVoted", values: readonly [Buffer, string]} | {tag: "TokenContract", values: void};


/**
 * Vote tallies for a proposal.
 */
export interface ProposalVoteCounts {
  /**
 * Total voting power cast as abstain.
 */
abstain_votes: u128;
  /**
 * Total voting power cast against the proposal.
 */
against_votes: u128;
  /**
 * Total voting power cast in favor of the proposal.
 */
for_votes: u128;
}


/**
 * Represents a operation to be executed by the timelock.
 * 
 * An operation encapsulates all the information needed to invoke a function
 * on a target contract after the timelock delay has passed.
 */
export interface Operation {
  /**
 * The serialized arguments to pass to the function
 */
args: Array<any>;
  /**
 * The function name to invoke on the target contract
 */
function: string;
  /**
 * Hash of a predecessor operation that must be executed first.
 * Use BytesN::<32>::from_array(&[0u8; 32]) for no predecessor.
 */
predecessor: Buffer;
  /**
 * A salt value for operation uniqueness.
 * Allows scheduling the same operation multiple times with different IDs.
 */
salt: Buffer;
  /**
 * The contract address to call
 */
target: string;
}

/**
 * The state of an operation in the timelock system.
 */
export type OperationState = {tag: "Unset", values: void} | {tag: "Waiting", values: void} | {tag: "Ready", values: void} | {tag: "Done", values: void};

/**
 * Storage keys for the timelock module.
 */
export type TimelockStorageKey = {tag: "MinDelay", values: void} | {tag: "OperationLedger", values: readonly [Buffer]};

export const RoleTransferError = {
  2200: {message:"NoPendingTransfer"},
  2201: {message:"InvalidLiveUntilLedger"},
  2202: {message:"InvalidPendingAccount"},
  2203: {message:"TransferExpired"}
}





export const AccessControlError = {
  2000: {message:"Unauthorized"},
  2001: {message:"AdminNotSet"},
  2002: {message:"IndexOutOfBounds"},
  2003: {message:"AdminRoleNotFound"},
  2004: {message:"RoleCountIsNotZero"},
  2005: {message:"RoleNotFound"},
  2006: {message:"AdminAlreadySet"},
  2007: {message:"RoleNotHeld"},
  2008: {message:"RoleIsEmpty"},
  2009: {message:"TransferInProgress"},
  2010: {message:"MaxRolesExceeded"}
}



export const OwnableError = {
  2100: {message:"OwnerNotSet"},
  2101: {message:"TransferInProgress"},
  2102: {message:"OwnerAlreadySet"}
}





/**
 * Stores the pending role holder and the explicit deadline for acceptance.
 */
export interface PendingTransfer {
  address: string;
  live_until_ledger: u32;
}


/**
 * Storage key for enumeration of accounts per role.
 */
export interface RoleAccountKey {
  index: u32;
  role: string;
}

/**
 * Storage keys for the data associated with the access control
 */
export type AccessControlStorageKey = {tag: "ExistingRoles", values: void} | {tag: "RoleAccounts", values: readonly [RoleAccountKey]} | {tag: "HasRole", values: readonly [string, string]} | {tag: "RoleAccountsCount", values: readonly [string]} | {tag: "RoleAdmin", values: readonly [string]} | {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void};

/**
 * Storage keys for `Ownable` utility.
 */
export type OwnableStorageKey = {tag: "Owner", values: void} | {tag: "PendingOwner", values: void};

/**
 * Context of a single authorized call performed by an address.
 * 
 * Custom account contracts that implement `__check_auth` special function
 * receive a list of `Context` values corresponding to all the calls that
 * need to be authorized.
 */
export type Context = {tag: "Contract", values: readonly [ContractContext]} | {tag: "CreateContractHostFn", values: readonly [CreateContractHostFnContext]} | {tag: "CreateContractWithCtorHostFn", values: readonly [CreateContractWithConstructorHostFnContext]};


/**
 * Authorization context of a single contract call.
 * 
 * This struct corresponds to a `require_auth_for_args` call for an address
 * from `contract` function with `fn_name` name and `args` arguments.
 */
export interface ContractContext {
  args: Array<any>;
  contract: string;
  fn_name: string;
}

/**
 * Contract executable used for creating a new contract and used in
 * `CreateContractHostFnContext`.
 */
export type ContractExecutable = {tag: "Wasm", values: readonly [Buffer]};


/**
 * Value of contract node in InvokerContractAuthEntry tree.
 */
export interface SubContractInvocation {
  context: ContractContext;
  sub_invocations: Array<InvokerContractAuthEntry>;
}

/**
 * A node in the tree of authorizations performed on behalf of the current
 * contract as invoker of the contracts deeper in the call stack.
 * 
 * This is used as an argument of `authorize_as_current_contract` host function.
 * 
 * This tree corresponds `require_auth[_for_args]` calls on behalf of the
 * current contract.
 */
export type InvokerContractAuthEntry = {tag: "Contract", values: readonly [SubContractInvocation]} | {tag: "CreateContractHostFn", values: readonly [CreateContractHostFnContext]} | {tag: "CreateContractWithCtorHostFn", values: readonly [CreateContractWithConstructorHostFnContext]};


/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 */
export interface CreateContractHostFnContext {
  executable: ContractExecutable;
  salt: Buffer;
}


/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 * This is the same as `CreateContractHostFnContext`, but also has
 * contract constructor arguments.
 */
export interface CreateContractWithConstructorHostFnContext {
  constructor_args: Array<any>;
  executable: ContractExecutable;
  salt: Buffer;
}

export type Executable = {tag: "Wasm", values: readonly [Buffer]} | {tag: "StellarAsset", values: void} | {tag: "Account", values: void};

export interface Client {
  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the name of the governor.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`GovernorError::NameNotSet`] - Occurs if the name has not been set.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a queue transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  queue: ({targets, functions, args, description_hash, eta, operator}: {targets: Array<string>, functions: Array<string>, args: Array<Array<any>>, description_hash: Buffer, eta: u32, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel: ({targets, functions, args, description_hash, operator}: {targets: Array<string>, functions: Array<string>, args: Array<Array<any>>, description_hash: Buffer, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a quorum transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quorum: ({ledger}: {ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u128>>

  /**
   * Construct and simulate a execute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute: ({targets, functions, args, description_hash, executor}: {targets: Array<string>, functions: Array<string>, args: Array<Array<any>>, description_hash: Buffer, executor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a propose transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  propose: ({targets, functions, args, description, proposer}: {targets: Array<string>, functions: Array<string>, args: Array<Array<any>>, description: string, proposer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the version of the governor contract.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`GovernorError::VersionNotSet`] - Occurs if the version has not been
   * set.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a cast_vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cast_vote: ({proposal_id, vote_type, reason, voter}: {proposal_id: Buffer, vote_type: u32, reason: string, voter: string}, options?: MethodOptions) => Promise<AssembledTransaction<u128>>

  /**
   * Construct and simulate a get_owner transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `Some(Address)` if ownership is set, or `None` if ownership has
   * been renounced.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   */
  get_owner: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a has_voted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns whether an account has voted on a proposal.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * * `proposal_id` - The unique identifier of the proposal.
   * * `account` - The address to check.
   */
  has_voted: ({proposal_id, account}: {proposal_id: Buffer, account: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a quorum_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  quorum_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_treasury: ({treasury_contract}: {treasury_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a voting_delay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  voting_delay: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a counting_mode transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a symbol identifying the counting strategy.
   * 
   * This function is expected to be used to display human-readable
   * information about the counting strategy, for example in UIs.
   * 
   * For simple counting, this returns `"simple"`.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   */
  counting_mode: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a voting_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  voting_period: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a proposal_state transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposal_state: ({proposal_id}: {proposal_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<ProposalState>>

  /**
   * Construct and simulate a set_quorum_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_quorum_bps: ({caller, quorum_bps}: {caller: string, quorum_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_proposal_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the proposal ID computed from the proposal details.
   * 
   * The proposal ID is a deterministic keccak256 hash of the XDR-serialized
   * targets, functions, args, and description hash. This allows anyone to
   * compute the ID without storing the full proposal data.
   * 
   * The `description_hash` is computed as
   * `keccak256(description.to_bytes())`, i.e., a keccak256 hash of the
   * raw UTF-8 bytes of the description string. Off-chain clients can
   * reproduce this by hashing the raw string bytes directly — no XDR
   * encoding is required.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * * `targets` - The addresses of contracts to call.
   * * `functions` - The function names to invoke on each target.
   * * `args` - The arguments for each function call.
   * * `description_hash` - The keccak256 hash of the description's raw
   * bytes.
   */
  get_proposal_id: ({targets, functions, args, description_hash}: {targets: Array<string>, functions: Array<string>, args: Array<Array<any>>, description_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a set_queue_delay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_queue_delay: ({caller, queue_delay}: {caller: string, queue_delay: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accepts a pending ownership transfer.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   * 
   * # Events
   * 
   * * topics - `["ownership_transfer_completed"]`
   * * data - `[new_owner: Address]`
   */
  accept_ownership: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_voting_delay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_voting_delay: ({caller, voting_delay}: {caller: string, voting_delay: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a proposal_deadline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposal_deadline: ({proposal_id}: {proposal_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a proposal_proposer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address of the proposer for a given proposal.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * * `proposal_id` - The unique identifier of the proposal.
   * 
   * # Errors
   * 
   * * [`GovernorError::ProposalNotFound`] - If the proposal does not exist.
   */
  proposal_proposer: ({proposal_id}: {proposal_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a proposal_snapshot transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposal_snapshot: ({proposal_id}: {proposal_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_voting_period transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_voting_period: ({caller, voting_period}: {caller: string, voting_period: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_token_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the address of the token contract that implements the Votes
   * trait.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`GovernorError::TokenContractNotSet`] - Occurs if the token contract
   * has not been set.
   */
  get_token_contract: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a governor_authority transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  governor_authority: ({authority}: {authority: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a proposal_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the minimum voting power required to create a proposal.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`GovernorError::ProposalThresholdNotSet`] - Occurs if the proposal
   * threshold has not been set.
   */
  proposal_threshold: (options?: MethodOptions) => Promise<AssembledTransaction<u128>>

  /**
   * Construct and simulate a renounce_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Renounces ownership of the contract.
   * 
   * Permanently removes the owner, disabling all functions gated by
   * `#[only_owner]`.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * 
   * # Errors
   * 
   * * [`OwnableError::TransferInProgress`] - If there is a pending ownership
   * transfer.
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * 
   * # Notes
   * 
   * * Authorization for the current owner is required.
   */
  renounce_ownership: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_token_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_token_contract: ({token_contract}: {token_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_ownership transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates a 2-step ownership transfer to a new address.
   * 
   * Requires authorization from the current owner. The new owner must later
   * call `accept_ownership()` to complete the transfer.
   * 
   * # Arguments
   * 
   * * `e` - Access to the Soroban environment.
   * * `new_owner` - The proposed new owner.
   * * `live_until_ledger` - Ledger number until which the new owner can
   * accept. A value of `0` cancels any pending transfer.
   * 
   * # Errors
   * 
   * * [`OwnableError::OwnerNotSet`] - If the owner is not set.
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   * 
   * # Notes
   * 
   * * Authorization for the current owner is required.
   */
  transfer_ownership: ({new_owner, live_until_ledger}: {new_owner: string, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a proposals_need_queuing transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proposals_need_queuing: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_governor_authority transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_governor_authority: ({authority, enabled}: {authority: string, enabled: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_proposal_threshold transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_proposal_threshold: ({caller, proposal_threshold}: {caller: string, proposal_threshold: u128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  declare txFromJSON: any;
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps}: {owner: string, token_contract: string, treasury_contract: string, voting_delay: u32, voting_period: u32, queue_delay: u32, proposal_threshold: u128, quorum_bps: u32},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({owner, token_contract, treasury_contract, voting_delay, voting_period, queue_delay, proposal_threshold, quorum_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAC0dvdmVybm9yS2V5AAAAAAQAAAAAAAAAAAAAAAhUcmVhc3VyeQAAAAAAAAAAAAAAClF1ZXVlRGVsYXkAAAAAAAEAAAAAAAAACFByb3Bvc2FsAAAAAQAAA+4AAAAgAAAAAQAAAAAAAAARR292ZXJub3JBdXRob3JpdHkAAAAAAAABAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAEFByb3Bvc2FsQ29yZVRpbWUAAAAGAAAAAAAAAANldGEAAAAABgAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAAAAAAVzdGF0ZQAAAAAAB9AAAAANUHJvcG9zYWxTdGF0ZQAAAAAAAAAAAAAIdm90ZV9lbmQAAAAGAAAAAAAAAA12b3RlX3NuYXBzaG90AAAAAAAABAAAAAAAAAAKdm90ZV9zdGFydAAAAAAABg==",
        "AAAAAAAAAKxSZXR1cm5zIHRoZSBuYW1lIG9mIHRoZSBnb3Zlcm5vci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6TmFtZU5vdFNldGBdIC0gT2NjdXJzIGlmIHRoZSBuYW1lIGhhcyBub3QgYmVlbiBzZXQuAAAABG5hbWUAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAFcXVldWUAAAAAAAAGAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAAAAAANldGEAAAAABAAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAAAAAAhvcGVyYXRvcgAAABMAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAGcXVvcnVtAAAAAAABAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAABAAAACg==",
        "AAAAAAAAAAAAAAAHZXhlY3V0ZQAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAAAAAAhleGVjdXRvcgAAABMAAAABAAAD7gAAACA=",
        "AAAAAAAAAAAAAAAHcHJvcG9zZQAAAAAFAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAA+4AAAAg",
        "AAAAAAAAAL5SZXR1cm5zIHRoZSB2ZXJzaW9uIG9mIHRoZSBnb3Zlcm5vciBjb250cmFjdC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6VmVyc2lvbk5vdFNldGBdIC0gT2NjdXJzIGlmIHRoZSB2ZXJzaW9uIGhhcyBub3QgYmVlbgpzZXQuAAAAAAAHdmVyc2lvbgAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAJY2FzdF92b3RlAAAAAAAABAAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAABnJlYXNvbgAAAAAAEAAAAAAAAAAFdm90ZXIAAAAAAAATAAAAAQAAAAo=",
        "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAMlSZXR1cm5zIHdoZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcHJvcG9zYWxfaWRgIC0gVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwcm9wb3NhbC4KKiBgYWNjb3VudGAgLSBUaGUgYWRkcmVzcyB0byBjaGVjay4AAAAAAAAJaGFzX3ZvdGVkAAAAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAAAAAAAB2FjY291bnQAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAAAAAAAKcXVvcnVtX2JwcwAAAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAMc2V0X3RyZWFzdXJ5AAAAAQAAAAAAAAARdHJlYXN1cnlfY29udHJhY3QAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAMdm90aW5nX2RlbGF5AAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAgAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAAAAAAAEXRyZWFzdXJ5X2NvbnRyYWN0AAAAAAAAEwAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAQAAAAAAAAAC3F1ZXVlX2RlbGF5AAAAAAQAAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAACgAAAAAAAAAKcXVvcnVtX2JwcwAAAAAABAAAAAA=",
        "AAAAAAAAARhSZXR1cm5zIGEgc3ltYm9sIGlkZW50aWZ5aW5nIHRoZSBjb3VudGluZyBzdHJhdGVneS4KClRoaXMgZnVuY3Rpb24gaXMgZXhwZWN0ZWQgdG8gYmUgdXNlZCB0byBkaXNwbGF5IGh1bWFuLXJlYWRhYmxlCmluZm9ybWF0aW9uIGFib3V0IHRoZSBjb3VudGluZyBzdHJhdGVneSwgZm9yIGV4YW1wbGUgaW4gVUlzLgoKRm9yIHNpbXBsZSBjb3VudGluZywgdGhpcyByZXR1cm5zIGAic2ltcGxlImAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAADWNvdW50aW5nX21vZGUAAAAAAAAAAAAAAQAAABE=",
        "AAAAAAAAAAAAAAANdm90aW5nX3BlcmlvZAAAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAOcHJvcG9zYWxfc3RhdGUAAAAAAAEAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAB9AAAAANUHJvcG9zYWxTdGF0ZQAAAA==",
        "AAAAAAAAAAAAAAAOc2V0X3F1b3J1bV9icHMAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAKcXVvcnVtX2JwcwAAAAAABAAAAAA=",
        "AAAAAAAAAyhSZXR1cm5zIHRoZSBwcm9wb3NhbCBJRCBjb21wdXRlZCBmcm9tIHRoZSBwcm9wb3NhbCBkZXRhaWxzLgoKVGhlIHByb3Bvc2FsIElEIGlzIGEgZGV0ZXJtaW5pc3RpYyBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgWERSLXNlcmlhbGl6ZWQKdGFyZ2V0cywgZnVuY3Rpb25zLCBhcmdzLCBhbmQgZGVzY3JpcHRpb24gaGFzaC4gVGhpcyBhbGxvd3MgYW55b25lIHRvCmNvbXB1dGUgdGhlIElEIHdpdGhvdXQgc3RvcmluZyB0aGUgZnVsbCBwcm9wb3NhbCBkYXRhLgoKVGhlIGBkZXNjcmlwdGlvbl9oYXNoYCBpcyBjb21wdXRlZCBhcwpga2VjY2FrMjU2KGRlc2NyaXB0aW9uLnRvX2J5dGVzKCkpYCwgaS5lLiwgYSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUKcmF3IFVURi04IGJ5dGVzIG9mIHRoZSBkZXNjcmlwdGlvbiBzdHJpbmcuIE9mZi1jaGFpbiBjbGllbnRzIGNhbgpyZXByb2R1Y2UgdGhpcyBieSBoYXNoaW5nIHRoZSByYXcgc3RyaW5nIGJ5dGVzIGRpcmVjdGx5IOKAlCBubyBYRFIKZW5jb2RpbmcgaXMgcmVxdWlyZWQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYHRhcmdldHNgIC0gVGhlIGFkZHJlc3NlcyBvZiBjb250cmFjdHMgdG8gY2FsbC4KKiBgZnVuY3Rpb25zYCAtIFRoZSBmdW5jdGlvbiBuYW1lcyB0byBpbnZva2Ugb24gZWFjaCB0YXJnZXQuCiogYGFyZ3NgIC0gVGhlIGFyZ3VtZW50cyBmb3IgZWFjaCBmdW5jdGlvbiBjYWxsLgoqIGBkZXNjcmlwdGlvbl9oYXNoYCAtIFRoZSBrZWNjYWsyNTYgaGFzaCBvZiB0aGUgZGVzY3JpcHRpb24ncyByYXcKYnl0ZXMuAAAAD2dldF9wcm9wb3NhbF9pZAAAAAAEAAAAAAAAAAd0YXJnZXRzAAAAA+oAAAATAAAAAAAAAAlmdW5jdGlvbnMAAAAAAAPqAAAAEQAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAQZGVzY3JpcHRpb25faGFzaAAAA+4AAAAgAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAPc2V0X3F1ZXVlX2RlbGF5AAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAALcXVldWVfZGVsYXkAAAAABAAAAAA=",
        "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAAQc2V0X3ZvdGluZ19kZWxheQAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAMdm90aW5nX2RlbGF5AAAABAAAAAA=",
        "AAAAAAAAAAAAAAARcHJvcG9zYWxfZGVhZGxpbmUAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAE",
        "AAAAAAAAAP5SZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSBwcm9wb3NlciBmb3IgYSBnaXZlbiBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcHJvcG9zYWxfaWRgIC0gVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBwcm9wb3NhbC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6UHJvcG9zYWxOb3RGb3VuZGBdIC0gSWYgdGhlIHByb3Bvc2FsIGRvZXMgbm90IGV4aXN0LgAAAAAAEXByb3Bvc2FsX3Byb3Bvc2VyAAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAARcHJvcG9zYWxfc25hcHNob3QAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAE",
        "AAAAAAAAAAAAAAARc2V0X3ZvdGluZ19wZXJpb2QAAAAAAAACAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADXZvdGluZ19wZXJpb2QAAAAAAAAEAAAAAA==",
        "AAAAAAAAAOhSZXR1cm5zIHRoZSBhZGRyZXNzIG9mIHRoZSB0b2tlbiBjb250cmFjdCB0aGF0IGltcGxlbWVudHMgdGhlIFZvdGVzCnRyYWl0LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIHRoZSBTb3JvYmFuIGVudmlyb25tZW50LgoKIyBFcnJvcnMKCiogW2BHb3Zlcm5vckVycm9yOjpUb2tlbkNvbnRyYWN0Tm90U2V0YF0gLSBPY2N1cnMgaWYgdGhlIHRva2VuIGNvbnRyYWN0CmhhcyBub3QgYmVlbiBzZXQuAAAAEmdldF90b2tlbl9jb250cmFjdAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAASZ292ZXJub3JfYXV0aG9yaXR5AAAAAAABAAAAAAAAAAlhdXRob3JpdHkAAAAAAAATAAAAAQAAAAE=",
        "AAAAAAAAAOVSZXR1cm5zIHRoZSBtaW5pbXVtIHZvdGluZyBwb3dlciByZXF1aXJlZCB0byBjcmVhdGUgYSBwcm9wb3NhbC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgR292ZXJub3JFcnJvcjo6UHJvcG9zYWxUaHJlc2hvbGROb3RTZXRgXSAtIE9jY3VycyBpZiB0aGUgcHJvcG9zYWwKdGhyZXNob2xkIGhhcyBub3QgYmVlbiBzZXQuAAAAAAAAEnByb3Bvc2FsX3RocmVzaG9sZAAAAAAAAAAAAAEAAAAK",
        "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAASc2V0X3Rva2VuX2NvbnRyYWN0AAAAAAABAAAAAAAAAA50b2tlbl9jb250cmFjdAAAAAAAEwAAAAA=",
        "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAWcHJvcG9zYWxzX25lZWRfcXVldWluZwAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAWc2V0X2dvdmVybm9yX2F1dGhvcml0eQAAAAAAAgAAAAAAAAAJYXV0aG9yaXR5AAAAAAAAEwAAAAAAAAAHZW5hYmxlZAAAAAABAAAAAA==",
        "AAAAAAAAAAAAAAAWc2V0X3Byb3Bvc2FsX3RocmVzaG9sZAAAAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAABJwcm9wb3NhbF90aHJlc2hvbGQAAAAAAAoAAAAA",
        "AAAABAAAACpFcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdm90ZXMgb3BlcmF0aW9ucy4AAAAAAAAAAAAKVm90ZXNFcnJvcgAAAAAABQAAABtUaGUgbGVkZ2VyIGlzIGluIHRoZSBmdXR1cmUAAAAADEZ1dHVyZUxvb2t1cAAAEAQAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAxNYXRoT3ZlcmZsb3cAABAFAAAAN0F0dGVtcHRpbmcgdG8gdHJhbnNmZXIgbW9yZSB2b3RpbmcgdW5pdHMgdGhhbiBhdmFpbGFibGUAAAAAF0luc3VmZmljaWVudFZvdGluZ1VuaXRzAAAAEAYAAAA/QXR0ZW1wdGluZyB0byBkZWxlZ2F0ZSB0byB0aGUgc2FtZSBkZWxlZ2F0ZSB0aGF0IGlzIGFscmVhZHkgc2V0AAAAAAxTYW1lRGVsZWdhdGUAABAHAAAAQEEgY2hlY2twb2ludCB0aGF0IHdhcyBleHBlY3RlZCB0byBleGlzdCB3YXMgbm90IGZvdW5kIGluIHN0b3JhZ2UAAAASQ2hlY2twb2ludE5vdEZvdW5kAAAAABAI",
        "AAAABQAAADNFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWNjb3VudCBjaGFuZ2VzIGl0cyBkZWxlZ2F0ZS4AAAAAAAAAAA9EZWxlZ2F0ZUNoYW5nZWQAAAAAAQAAABBkZWxlZ2F0ZV9jaGFuZ2VkAAAAAwAAACVUaGUgYWNjb3VudCB0aGF0IGNoYW5nZWQgaXRzIGRlbGVnYXRlAAAAAAAACWRlbGVnYXRvcgAAAAAAABMAAAABAAAAHlRoZSBwcmV2aW91cyBkZWxlZ2F0ZSAoaWYgYW55KQAAAAAADWZyb21fZGVsZWdhdGUAAAAAAAPoAAAAEwAAAAAAAAAQVGhlIG5ldyBkZWxlZ2F0ZQAAAAt0b19kZWxlZ2F0ZQAAAAATAAAAAAAAAAI=",
        "AAAABQAAADVFdmVudCBlbWl0dGVkIHdoZW4gYSBkZWxlZ2F0ZSdzIHZvdGluZyBwb3dlciBjaGFuZ2VzLgAAAAAAAAAAAAAURGVsZWdhdGVWb3Rlc0NoYW5nZWQAAAABAAAAFmRlbGVnYXRlX3ZvdGVzX2NoYW5nZWQAAAAAAAMAAAAnVGhlIGRlbGVnYXRlIHdob3NlIHZvdGluZyBwb3dlciBjaGFuZ2VkAAAAAAhkZWxlZ2F0ZQAAABMAAAABAAAAGVRoZSBwcmV2aW91cyB2b3RpbmcgcG93ZXIAAAAAAAAOcHJldmlvdXNfdm90ZXMAAAAAAAoAAAAAAAAAFFRoZSBuZXcgdm90aW5nIHBvd2VyAAAACW5ld192b3RlcwAAAAAAAAoAAAAAAAAAAg==",
        "AAAABQAAACJFdmVudCBlbWl0dGVkIHdoZW4gYSB2b3RlIGlzIGNhc3QuAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAl2b3RlX2Nhc3QAAAAAAAAFAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAWVGhlIHR5cGUgb2Ygdm90ZSBjYXN0LgAAAAAACXZvdGVfdHlwZQAAAAAAAAQAAAAAAAAAFlRoZSB2b3RpbmcgcG93ZXIgdXNlZC4AAAAAAAZ3ZWlnaHQAAAAAAAoAAAAAAAAAJ1RoZSB2b3RlcidzIGV4cGxhbmF0aW9uIGZvciB0aGVpciB2b3RlLgAAAAAGcmVhc29uAAAAAAAQAAAAAAAAAAI=",
        "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gZ292ZXJub3Igb3BlcmF0aW9ucy4AAAAAAAAAAAAADUdvdmVybm9yRXJyb3IAAAAAAAAXAAAAG1RoZSBwcm9wb3NhbCB3YXMgbm90IGZvdW5kLgAAAAAQUHJvcG9zYWxOb3RGb3VuZAAAE4gAAAAcVGhlIHByb3Bvc2FsIGFscmVhZHkgZXhpc3RzLgAAABVQcm9wb3NhbEFscmVhZHlFeGlzdHMAAAAAABOJAAAAL1RoZSBwcm9wb3NlciBkb2VzIG5vdCBoYXZlIGVub3VnaCB2b3RpbmcgcG93ZXIuAAAAABlJbnN1ZmZpY2llbnRQcm9wb3NlclZvdGVzAAAAAAATigAAACFUaGUgcHJvcG9zYWwgY29udGFpbnMgbm8gYWN0aW9ucy4AAAAAAAANRW1wdHlQcm9wb3NhbAAAAAAAE4sAAABAVGhlIHRhcmdldHMsIGZ1bmN0aW9ucywgYW5kIGFyZ3MgdmVjdG9ycyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzLgAAABVJbnZhbGlkUHJvcG9zYWxMZW5ndGgAAAAAABOMAAAAKFRoZSBwcm9wb3NhbCBpcyBub3QgaW4gdGhlIGFjdGl2ZSBzdGF0ZS4AAAARUHJvcG9zYWxOb3RBY3RpdmUAAAAAABONAAAAH1RoZSBwcm9wb3NhbCBoYXMgbm90IHN1Y2NlZWRlZC4AAAAAFVByb3Bvc2FsTm90U3VjY2Vzc2Z1bAAAAAAAE44AAAAhVGhlIHByb3Bvc2FsIGhhcyBub3QgYmVlbiBxdWV1ZWQuAAAAAAAAEVByb3Bvc2FsTm90UXVldWVkAAAAAAATjwAAACdUaGUgcHJvcG9zYWwgaGFzIGFscmVhZHkgYmVlbiBleGVjdXRlZC4AAAAAF1Byb3Bvc2FsQWxyZWFkeUV4ZWN1dGVkAAAAE5AAAABSVGhlIHByb3Bvc2FsIGlzIGluIGEgbm9uLWNhbmNlbGxhYmxlIHN0YXRlIChgQ2FuY2VsZWRgLCBgRXhwaXJlZGAsIG9yCmBFeGVjdXRlZGApLgAAAAAAFlByb3Bvc2FsTm90Q2FuY2VsbGFibGUAAAAAE5EAAAAiVGhlIHZvdGluZyBkZWxheSBoYXMgbm90IGJlZW4gc2V0LgAAAAAAEVZvdGluZ0RlbGF5Tm90U2V0AAAAAAATkgAAACNUaGUgdm90aW5nIHBlcmlvZCBoYXMgbm90IGJlZW4gc2V0LgAAAAASVm90aW5nUGVyaW9kTm90U2V0AAAAABOTAAAAKFRoZSBwcm9wb3NhbCB0aHJlc2hvbGQgaGFzIG5vdCBiZWVuIHNldC4AAAAXUHJvcG9zYWxUaHJlc2hvbGROb3RTZXQAAAATlAAAABpUaGUgbmFtZSBoYXMgbm90IGJlZW4gc2V0LgAAAAAACk5hbWVOb3RTZXQAAAAAE5UAAAAdVGhlIHZlcnNpb24gaGFzIG5vdCBiZWVuIHNldC4AAAAAAAANVmVyc2lvbk5vdFNldAAAAAAAE5YAAAAdQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZC4AAAAAAAAMTWF0aE92ZXJmbG93AAATlwAAAC9UaGUgYWNjb3VudCBoYXMgYWxyZWFkeSB2b3RlZCBvbiB0aGlzIHByb3Bvc2FsLgAAAAAMQWxyZWFkeVZvdGVkAAATmAAAAC5UaGUgdm90ZSB0eXBlIGlzIGludmFsaWQgKG11c3QgYmUgMCwgMSwgb3IgMikuAAAAAAAPSW52YWxpZFZvdGVUeXBlAAAAE5kAAAAcVGhlIHF1b3J1bSBoYXMgbm90IGJlZW4gc2V0LgAAAAxRdW9ydW1Ob3RTZXQAABOaAAAAR1RoZSB0b2tlbiBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIHNldCAoY2FuIG9ubHkgYmUgaW5pdGlhbGl6ZWQgb25jZSkuAAAAABdUb2tlbkNvbnRyYWN0QWxyZWFkeVNldAAAABObAAAAJFRoZSB0b2tlbiBjb250cmFjdCBoYXMgbm90IGJlZW4gc2V0LgAAABNUb2tlbkNvbnRyYWN0Tm90U2V0AAAAE5wAAAA8VGhlIHByb3Bvc2FsIGRlc2NyaXB0aW9uIGV4Y2VlZHMgdGhlIG1heGltdW0gYWxsb3dlZCBsZW5ndGguAAAAEkRlc2NyaXB0aW9uVG9vTG9uZwAAAAATnQAAAClRdWV1aW5nIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIGdvdmVybm9yLgAAAAAAAA9RdWV1ZU5vdEVuYWJsZWQAAAATng==",
        "AAAAAwAABABUaGUgc3RhdGUgb2YgYSBwcm9wb3NhbCBpbiBpdHMgbGlmZWN5Y2xlLgoKU3RhdGVzIGFyZSBkaXZpZGVkIGludG8gdHdvIGNhdGVnb3JpZXM6CgojIyBUaW1lLWJhc2VkIHN0YXRlcyAoZGVyaXZlZCwgbmV2ZXIgc3RvcmVkIGV4cGxpY2l0bHkpCgpUaGVzZSBhcmUgY29tcHV0ZWQgYnkgW2BnZXRfcHJvcG9zYWxfc3RhdGUoKWBdIGZyb20gdGhlIGN1cnJlbnQgbGVkZ2VyCnJlbGF0aXZlIHRvIHRoZSBwcm9wb3NhbCdzIHZvdGluZyBzY2hlZHVsZS4gVGhleSBhcmUgb25seSByZXR1cm5lZCB3aGVuCm5vIGV4cGxpY2l0IHN0YXRlIGhhcyBiZWVuIHNldC4KCi0gW2BQZW5kaW5nYF0oUHJvcG9zYWxTdGF0ZTo6UGVuZGluZykg4oCUIHZvdGluZyBoYXMgbm90IHN0YXJ0ZWQgeWV0LgotIFtgQWN0aXZlYF0oUHJvcG9zYWxTdGF0ZTo6QWN0aXZlKSDigJQgdm90aW5nIGlzIG9uZ29pbmcuCi0gW2BEZWZlYXRlZGBdKFByb3Bvc2FsU3RhdGU6OkRlZmVhdGVkKSDigJQgdm90aW5nIGVuZGVkICoqd2l0aG91dCoqIHRoZQpjb3VudGluZyBsb2dpYyBtYXJraW5nIHRoZSBwcm9wb3NhbCBhcyBgU3VjY2VlZGVkYC4KCiMjIEV4cGxpY2l0IHN0YXRlcwoKU2V0IGV4cGxpY2l0bHkgYnkgdGhlIEdvdmVybm9yIG9yIGl0cyBleHRlbnNpb25zIGFuZCBwZXJzaXN0ZWQgaW4Kc3RvcmFnZS4gT25jZSBzZXQsIHRoZXkgdGFrZSBwcmVjZWRlbmNlIG92ZXIgYW55IHRpbWUtYmFzZWQgZGVyaXZhdGlvbi4KCi0gW2BDYW5jZWxlZGBdKFByb3Bvc2FsU3RhdGU6OkNhbmNlbGVkKSDigJQgc2V0IGJ5IHRoZSBHb3Zlcm5vci4KLSBbYFN1Y2NlZWRlZGBdKFByb3Bvc2FsU3RhdGU6OlN1Y2NlZWRlZCkg4oCUIHNldCBieSB0aGUgY291bnRpbmcgbG9naWMuCi0gW2BRdWV1ZWRgXShQcm9wb3NhbFN0YXRlOjpRdWV1ZWQpIC8gW2BFeHBpcmVkYF0oUHJvcG9zYWxTdGF0ZTo6RXhwaXJlZCkg4oCUCnNldCBieSBleHRlbnNpb25zIGxpa2UgYFRpbWVsb2NrQ29udHJvbGAuCi0gW2BFeGVjdXRlZGBdKFByb3Bvc2FsU3RhdGU6OkV4ZWN1AAAAAAAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAACAAAADdUaGUgcHJvcG9zYWwgaXMgcGVuZGluZyBhbmQgdm90aW5nIGhhcyBub3Qgc3RhcnRlZCB5ZXQuAAAAAAdQZW5kaW5nAAAAAAAAAAAtVGhlIHByb3Bvc2FsIGlzIGFjdGl2ZSBhbmQgdm90aW5nIGlzIG9uZ29pbmcuAAAAAAAABkFjdGl2ZQAAAAAAAQAAAMhUaGUgcHJvcG9zYWwgd2FzIGRlZmVhdGVkIChkaWQgbm90IG1lZXQgcXVvcnVtIG9yIG1ham9yaXR5KS4gVGhpcyBpcwp0aGUgZGVmYXVsdCBvdXRjb21lIHdoZW4gdm90aW5nIGVuZHMgYW5kIHRoZSBjb3VudGluZyBsb2dpYyBoYXMKbm90IG1hcmtlZCB0aGUgcHJvcG9zYWwgYXMgW2BTdWNjZWVkZWRgXShQcm9wb3NhbFN0YXRlOjpTdWNjZWVkZWQpLgAAAAhEZWZlYXRlZAAAAAIAAAA1VGhlIHByb3Bvc2FsIGhhcyBiZWVuIGNhbmNlbGxlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAAAAAIQ2FuY2VsZWQAAAADAAAA3lRoZSBwcm9wb3NhbCBzdWNjZWVkZWQgYW5kIGNhbiBiZSBleGVjdXRlZC4gU2V0IGJ5IHRoZSBjb3VudGluZwpsb2dpYyB3aGVuIHRoZSBwcm9wb3NhbCBtZWV0cyB0aGUgcmVxdWlyZWQgcXVvcnVtIGFuZCB2b3RlCnRocmVzaG9sZHMuIElmIGEgcXVldWluZyBleHRlbnNpb24gaXMgZW5hYmxlZCwgdGhpcyBzdGF0ZSBtZWFucyB0aGUKcHJvcG9zYWwgaXMgcmVhZHkgdG8gYmUgcXVldWVkLgAAAAAACVN1Y2NlZWRlZAAAAAAAAAQAAABPVGhlIHByb3Bvc2FsIGlzIHF1ZXVlZCBmb3IgZXhlY3V0aW9uLiBTZXQgYnkgZXh0ZW5zaW9ucyBsaWtlCmBUaW1lbG9ja0NvbnRyb2xgLgAAAAAGUXVldWVkAAAAAAAFAAAAYVRoZSBwcm9wb3NhbCBoYXMgZXhwaXJlZCBhbmQgY2FuIG5vIGxvbmdlciBiZSBleGVjdXRlZC4gU2V0IGJ5CmV4dGVuc2lvbnMgbGlrZSBgVGltZWxvY2tDb250cm9sYC4AAAAAAAAHRXhwaXJlZAAAAAAGAAAANFRoZSBwcm9wb3NhbCBoYXMgYmVlbiBleGVjdXRlZC4gU2V0IGJ5IHRoZSBHb3Zlcm5vci4AAAAIRXhlY3V0ZWQAAAAH",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIHF1b3J1bSB2YWx1ZSBpcyBjaGFuZ2VkLgAAAAAAAAAADVF1b3J1bUNoYW5nZWQAAAAAAAABAAAADnF1b3J1bV9jaGFuZ2VkAAAAAAACAAAAAAAAAApvbGRfcXVvcnVtAAAAAAAKAAAAAAAAAAAAAAAKbmV3X3F1b3J1bQAAAAAACgAAAAAAAAAC",
        "AAAABQAAAChFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBxdWV1ZWQuAAAAAAAAAA5Qcm9wb3NhbFF1ZXVlZAAAAAAAAQAAAA9wcm9wb3NhbF9xdWV1ZWQAAAAAAgAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAAAAAANldGEAAAAABAAAAAAAAAAC",
        "AAAABQAAAClFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjcmVhdGVkLgAAAAAAAAAAAAAPUHJvcG9zYWxDcmVhdGVkAAAAAAEAAAAQcHJvcG9zYWxfY3JlYXRlZAAAAAgAAAAAAAAAC3Byb3Bvc2FsX2lkAAAAA+4AAAAgAAAAAQAAAAAAAAAIcHJvcG9zZXIAAAATAAAAAQAAAAAAAAAHdGFyZ2V0cwAAAAPqAAAAEwAAAAAAAAAAAAAACWZ1bmN0aW9ucwAAAAAAA+oAAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAPqAAAAAAAAAAAAAAAAAAAADXZvdGVfc25hcHNob3QAAAAAAAAEAAAAAAAAAAAAAAAIdm90ZV9lbmQAAAAEAAAAAAAAAAAAAAALZGVzY3JpcHRpb24AAAAAEAAAAAAAAAAC",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBleGVjdXRlZC4AAAAAAAAAAAAQUHJvcG9zYWxFeGVjdXRlZAAAAAEAAAARcHJvcG9zYWxfZXhlY3V0ZWQAAAAAAAABAAAAAAAAAAtwcm9wb3NhbF9pZAAAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSBwcm9wb3NhbCBpcyBjYW5jZWxsZWQuAAAAAAAAAAARUHJvcG9zYWxDYW5jZWxsZWQAAAAAAAABAAAAEnByb3Bvc2FsX2NhbmNlbGxlZAAAAAAAAQAAAAAAAAALcHJvcG9zYWxfaWQAAAAD7gAAACAAAAABAAAAAg==",
        "AAAABAAAAC1FcnJvcnMgdGhhdCBjYW4gb2NjdXIgaW4gdGltZWxvY2sgb3BlcmF0aW9ucy4AAAAAAAAAAAAADVRpbWVsb2NrRXJyb3IAAAAAAAAHAAAAIlRoZSBvcGVyYXRpb24gaXMgYWxyZWFkeSBzY2hlZHVsZWQAAAAAABlPcGVyYXRpb25BbHJlYWR5U2NoZWR1bGVkAAAAAAAPoAAAADFUaGUgZGVsYXkgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtIHJlcXVpcmVkIGRlbGF5AAAAAAAAEUluc3VmZmljaWVudERlbGF5AAAAAAAPoQAAACpUaGUgb3BlcmF0aW9uIGlzIG5vdCBpbiB0aGUgZXhwZWN0ZWQgc3RhdGUAAAAAABVJbnZhbGlkT3BlcmF0aW9uU3RhdGUAAAAAAA+iAAAAMUEgcHJlZGVjZXNzb3Igb3BlcmF0aW9uIGhhcyBub3QgYmVlbiBleGVjdXRlZCB5ZXQAAAAAAAAVVW5leGVjdXRlZFByZWRlY2Vzc29yAAAAAAAPowAAADNUaGUgY2FsbGVyIGlzIG5vdCBhdXRob3JpemVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24AAAAADFVuYXV0aG9yaXplZAAAD6QAAAAiVGhlIG1pbmltdW0gZGVsYXkgaGFzIG5vdCBiZWVuIHNldAAAAAAADk1pbkRlbGF5Tm90U2V0AAAAAA+lAAAAJFRoZSBvcGVyYXRpb24gaGFzIG5vdCBiZWVuIHNjaGVkdWxlZAAAABVPcGVyYXRpb25Ob3RTY2hlZHVsZWQAAAAAAA+m",
        "AAAABQAAADBFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1pbmltdW0gZGVsYXkgaXMgY2hhbmdlZC4AAAAAAAAAD01pbkRlbGF5Q2hhbmdlZAAAAAABAAAAEW1pbl9kZWxheV9jaGFuZ2VkAAAAAAAAAgAAAAAAAAAJb2xkX2RlbGF5AAAAAAAABAAAAAAAAAAAAAAACW5ld19kZWxheQAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGV4ZWN1dGVkLgAAAAAAAAART3BlcmF0aW9uRXhlY3V0ZWQAAAAAAAABAAAAEm9wZXJhdGlvbl9leGVjdXRlZAAAAAAABgAAAAAAAAACaWQAAAAAA+4AAAAgAAAAAQAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAQAAAAAAAAAIZnVuY3Rpb24AAAARAAAAAAAAAAAAAAAEYXJncwAAA+oAAAAAAAAAAAAAAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAAAAAAAAAAAAAARzYWx0AAAD7gAAACAAAAAAAAAAAg==",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIGNhbmNlbGxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvbkNhbmNlbGxlZAAAAAAAAQAAABNvcGVyYXRpb25fY2FuY2VsbGVkAAAAAAEAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAC",
        "AAAABQAAAC1FdmVudCBlbWl0dGVkIHdoZW4gYW4gb3BlcmF0aW9uIGlzIHNjaGVkdWxlZC4AAAAAAAAAAAAAEk9wZXJhdGlvblNjaGVkdWxlZAAAAAAAAQAAABNvcGVyYXRpb25fc2NoZWR1bGVkAAAAAAcAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAAAAAACGZ1bmN0aW9uAAAAEQAAAAAAAAAAAAAABGFyZ3MAAAPqAAAAAAAAAAAAAAAAAAAAC3ByZWRlY2Vzc29yAAAAA+4AAAAgAAAAAAAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAAAAAAAAAAAFZGVsYXkAAAAAAAAEAAAAAAAAAAI=",
        "AAAAAQAAAElBIGNoZWNrcG9pbnQgcmVjb3JkaW5nIHZvdGluZyBwb3dlciBhdCBhIHNwZWNpZmljIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIuAAAAAAAAAAAAAApDaGVja3BvaW50AAAAAAACAAAAO1RoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gdGhpcyBjaGVja3BvaW50IHdhcyBjcmVhdGVkAAAAAAZsZWRnZXIAAAAAAAQAAAAvVGhlIHZvdGluZyBwb3dlciBhdCB0aGlzIGxlZGdlciBzZXF1ZW5jZSBudW1iZXIAAAAABXZvdGVzAAAAAAAACg==",
        "AAAAAgAAAMNTZWxlY3RzIHRoZSBjaGVja3BvaW50IHRpbWVsaW5lIHRvIG9wZXJhdGUgb24uCgpFYWNoIHZhcmlhbnQgbWFwcyB0byBhIGRpZmZlcmVudCBzZXQgb2Ygc3RvcmFnZSBrZXlzIHNvIHRoYXQKcGVyLWFjY291bnQgdm90aW5nLXBvd2VyIGhpc3RvcnkgYW5kIGFnZ3JlZ2F0ZSB0b3RhbCBzdXBwbHkgaGlzdG9yeQphcmUga2VwdCBzZXBhcmF0ZS4AAAAAAAAAAA5DaGVja3BvaW50VHlwZQAAAAAAAgAAAAAAAAAjVGhlIGdsb2JhbCB0b3RhbCBzdXBwbHkgY2hlY2twb2ludC4AAAAAC1RvdGFsU3VwcGx5AAAAAAEAAAAxQSBwZXItYWNjb3VudCAoZGVsZWdhdGUpIHZvdGluZy1wb3dlciBjaGVja3BvaW50LgAAAAAAAAdBY2NvdW50AAAAAAEAAAAT",
        "AAAAAgAAAPdTdG9yYWdlIGtleXMgZm9yIHRoZSB2b3RlcyBtb2R1bGUuCgpPbmx5IGRlbGVnYXRlZCB2b3RpbmcgcG93ZXIgY291bnRzIGFzIHZvdGVzIChpLmUuLCBvbmx5IGRlbGVnYXRlZXMgY2FuCnZvdGUpLCBzbyB0aGUgc3RvcmFnZSBkZXNpZ24gdHJhY2tzIGRlbGVnYXRlcyBhbmQgdGhlaXIgY2hlY2twb2ludGVkCnZvdGluZyBwb3dlciBzZXBhcmF0ZWx5IGZyb20gdGhlIHJhdyB2b3RpbmcgdW5pdHMgaGVsZCBieSBlYWNoIGFjY291bnQuAAAAAAAAAAAPVm90ZXNTdG9yYWdlS2V5AAAAAAYAAAABAAAAHE1hcHMgYWNjb3VudCB0byBpdHMgZGVsZWdhdGUAAAAJRGVsZWdhdGVlAAAAAAAAAQAAABMAAAABAAAAJE51bWJlciBvZiBjaGVja3BvaW50cyBmb3IgYSBkZWxlZ2F0ZQAAAA5OdW1DaGVja3BvaW50cwAAAAAAAQAAABMAAAABAAAALUluZGl2aWR1YWwgY2hlY2twb2ludCBmb3IgYSBkZWxlZ2F0ZSBhdCBpbmRleAAAAAAAABJEZWxlZ2F0ZUNoZWNrcG9pbnQAAAAAAAIAAAATAAAABAAAAAAAAAAiTnVtYmVyIG9mIHRvdGFsIHN1cHBseSBjaGVja3BvaW50cwAAAAAAGU51bVRvdGFsU3VwcGx5Q2hlY2twb2ludHMAAAAAAAABAAAAK0luZGl2aWR1YWwgdG90YWwgc3VwcGx5IGNoZWNrcG9pbnQgYXQgaW5kZXgAAAAAFVRvdGFsU3VwcGx5Q2hlY2twb2ludAAAAAAAAAEAAAAEAAAAAQAAAERWb3RpbmcgdW5pdHMgaGVsZCBieSBhbiBhY2NvdW50ICh0cmFja2VkIHNlcGFyYXRlbHkgZnJvbSBkZWxlZ2F0aW9uKQAAAAtWb3RpbmdVbml0cwAAAAABAAAAEw==",
        "AAAAAQAAACNDb3JlIHByb3Bvc2FsIGRhdGEgc3RvcmVkIG9uLWNoYWluLgAAAAAAAAAADFByb3Bvc2FsQ29yZQAAAAQAAAAmVGhlIGFkZHJlc3MgdGhhdCBjcmVhdGVkIHRoZSBwcm9wb3NhbC4AAAAAAAhwcm9wb3NlcgAAABMAAAAiVGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHByb3Bvc2FsLgAAAAAABXN0YXRlAAAAAAAH0AAAAA1Qcm9wb3NhbFN0YXRlAAAAAAAAM1RoZSBsYXN0IGxlZGdlciB3aGVyZSB2b3RpbmcgaXMgYWN0aXZlIChpbmNsdXNpdmUpLgAAAAAIdm90ZV9lbmQAAAAEAAAAZ1RoZSBsZWRnZXIgYXQgd2hpY2ggdm90aW5nIHBvd2VyIGlzIHNuYXBzaG90dGVkLiBWb3Rpbmcgb3BlbnMgb24KdGhlIG5leHQgbGVkZ2VyIChgdm90ZV9zbmFwc2hvdCArIDFgKS4AAAAADXZvdGVfc25hcHNob3QAAAAAAAAE",
        "AAAAAQAAAERBIHF1b3J1bSBjaGVja3BvaW50IHJlY29yZGluZyB0aGUgcXVvcnVtIHZhbHVlIGF0IGEgc3BlY2lmaWMgbGVkZ2VyLgAAAAAAAAAQUXVvcnVtQ2hlY2twb2ludAAAAAIAAAAyVGhlIGxlZGdlciBhdCB3aGljaCB0aGlzIHF1b3J1bSB2YWx1ZSB0b29rIGVmZmVjdC4AAAAAAAZsZWRnZXIAAAAAAAQAAAARVGhlIHF1b3J1bSB2YWx1ZS4AAAAAAAAGcXVvcnVtAAAAAAAK",
        "AAAAAgAAACdTdG9yYWdlIGtleXMgZm9yIHRoZSBHb3Zlcm5vciBjb250cmFjdC4AAAAAAAAAABJHb3Zlcm5vclN0b3JhZ2VLZXkAAAAAAAsAAAAAAAAAGVRoZSBuYW1lIG9mIHRoZSBnb3Zlcm5vci4AAAAAAAAETmFtZQAAAAAAAAAlVGhlIHZlcnNpb24gb2YgdGhlIGdvdmVybm9yIGNvbnRyYWN0LgAAAAAAAAdWZXJzaW9uAAAAAAAAAAAcVGhlIHZvdGluZyBkZWxheSBpbiBsZWRnZXJzLgAAAAtWb3RpbmdEZWxheQAAAAAAAAAAHVRoZSB2b3RpbmcgcGVyaW9kIGluIGxlZGdlcnMuAAAAAAAADFZvdGluZ1BlcmlvZAAAAAAAAAApTWluaW11bSB2b3RpbmcgcG93ZXIgcmVxdWlyZWQgdG8gcHJvcG9zZS4AAAAAAAARUHJvcG9zYWxUaHJlc2hvbGQAAAAAAAABAAAAJVByb3Bvc2FsIGRhdGEgaW5kZXhlZCBieSBwcm9wb3NhbCBJRC4AAAAAAAAIUHJvcG9zYWwAAAABAAAD7gAAACAAAAAAAAAAHU51bWJlciBvZiBxdW9ydW0gY2hlY2twb2ludHMuAAAAAAAAFE51bVF1b3J1bUNoZWNrcG9pbnRzAAAAAQAAACZJbmRpdmlkdWFsIHF1b3J1bSBjaGVja3BvaW50IGF0IGluZGV4LgAAAAAAEFF1b3J1bUNoZWNrcG9pbnQAAAABAAAABAAAAAEAAAA0Vm90ZSB0YWxsaWVzIGZvciBhIHByb3Bvc2FsLCBpbmRleGVkIGJ5IHByb3Bvc2FsIElELgAAAAxQcm9wb3NhbFZvdGUAAAABAAAD7gAAACAAAAABAAAAK1doZXRoZXIgYW4gYWNjb3VudCBoYXMgdm90ZWQgb24gYSBwcm9wb3NhbC4AAAAACEhhc1ZvdGVkAAAAAgAAA+4AAAAgAAAAEwAAAAAAAABCVGhlIGFkZHJlc3Mgb2YgdGhlIHRva2VuIGNvbnRyYWN0IHRoYXQgaW1wbGVtZW50cyB0aGUgVm90ZXMgdHJhaXQuAAAAAAANVG9rZW5Db250cmFjdAAAAA==",
        "AAAAAQAAABxWb3RlIHRhbGxpZXMgZm9yIGEgcHJvcG9zYWwuAAAAAAAAABJQcm9wb3NhbFZvdGVDb3VudHMAAAAAAAMAAAAjVG90YWwgdm90aW5nIHBvd2VyIGNhc3QgYXMgYWJzdGFpbi4AAAAADWFic3RhaW5fdm90ZXMAAAAAAAAKAAAALVRvdGFsIHZvdGluZyBwb3dlciBjYXN0IGFnYWluc3QgdGhlIHByb3Bvc2FsLgAAAAAAAA1hZ2FpbnN0X3ZvdGVzAAAAAAAACgAAADFUb3RhbCB2b3RpbmcgcG93ZXIgY2FzdCBpbiBmYXZvciBvZiB0aGUgcHJvcG9zYWwuAAAAAAAACWZvcl92b3RlcwAAAAAAAAo=",
        "AAAAAQAAALtSZXByZXNlbnRzIGEgb3BlcmF0aW9uIHRvIGJlIGV4ZWN1dGVkIGJ5IHRoZSB0aW1lbG9jay4KCkFuIG9wZXJhdGlvbiBlbmNhcHN1bGF0ZXMgYWxsIHRoZSBpbmZvcm1hdGlvbiBuZWVkZWQgdG8gaW52b2tlIGEgZnVuY3Rpb24Kb24gYSB0YXJnZXQgY29udHJhY3QgYWZ0ZXIgdGhlIHRpbWVsb2NrIGRlbGF5IGhhcyBwYXNzZWQuAAAAAAAAAAAJT3BlcmF0aW9uAAAAAAAABQAAADBUaGUgc2VyaWFsaXplZCBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgZnVuY3Rpb24AAAAEYXJncwAAA+oAAAAAAAAAMlRoZSBmdW5jdGlvbiBuYW1lIHRvIGludm9rZSBvbiB0aGUgdGFyZ2V0IGNvbnRyYWN0AAAAAAAIZnVuY3Rpb24AAAARAAAAeUhhc2ggb2YgYSBwcmVkZWNlc3NvciBvcGVyYXRpb24gdGhhdCBtdXN0IGJlIGV4ZWN1dGVkIGZpcnN0LgpVc2UgQnl0ZXNOOjo8MzI+Ojpmcm9tX2FycmF5KCZbMHU4OyAzMl0pIGZvciBubyBwcmVkZWNlc3Nvci4AAAAAAAALcHJlZGVjZXNzb3IAAAAD7gAAACAAAABuQSBzYWx0IHZhbHVlIGZvciBvcGVyYXRpb24gdW5pcXVlbmVzcy4KQWxsb3dzIHNjaGVkdWxpbmcgdGhlIHNhbWUgb3BlcmF0aW9uIG11bHRpcGxlIHRpbWVzIHdpdGggZGlmZmVyZW50IElEcy4AAAAAAARzYWx0AAAD7gAAACAAAAAcVGhlIGNvbnRyYWN0IGFkZHJlc3MgdG8gY2FsbAAAAAZ0YXJnZXQAAAAAABM=",
        "AAAAAgAAADFUaGUgc3RhdGUgb2YgYW4gb3BlcmF0aW9uIGluIHRoZSB0aW1lbG9jayBzeXN0ZW0uAAAAAAAAAAAAAA5PcGVyYXRpb25TdGF0ZQAAAAAABAAAAAAAAAAgT3BlcmF0aW9uIGhhcyBub3QgYmVlbiBzY2hlZHVsZWQAAAAFVW5zZXQAAAAAAAAAAAAAOk9wZXJhdGlvbiBpcyBzY2hlZHVsZWQgYnV0IHRoZSBkZWxheSBwZXJpb2QgaGFzIG5vdCBwYXNzZWQAAAAAAAdXYWl0aW5nAAAAAAAAAAA0T3BlcmF0aW9uIGlzIHJlYWR5IHRvIGJlIGV4ZWN1dGVkIChkZWxheSBoYXMgcGFzc2VkKQAAAAVSZWFkeQAAAAAAAAAAAAAbT3BlcmF0aW9uIGhhcyBiZWVuIGV4ZWN1dGVkAAAAAAREb25l",
        "AAAAAgAAACVTdG9yYWdlIGtleXMgZm9yIHRoZSB0aW1lbG9jayBtb2R1bGUuAAAAAAAAAAAAABJUaW1lbG9ja1N0b3JhZ2VLZXkAAAAAAAIAAAAAAAAAJ01pbmltdW0gZGVsYXkgaW4gbGVkZ2VycyBmb3Igb3BlcmF0aW9ucwAAAAAITWluRGVsYXkAAAABAAAAtk1hcHMgb3BlcmF0aW9uIElEIHRvIHRoZSBsZWRnZXIgc2VxdWVuY2UgbnVtYmVyIHdoZW4gaXQgd2lsbCBiZSBpbiBhCltgT3BlcmF0aW9uU3RhdGU6OlJlYWR5YF0gc3RhdGUgKE5vdGU6IHZhbHVlIGlzIDAgZm9yCltgT3BlcmF0aW9uU3RhdGU6OlVuc2V0YF0sIDEgZm9yIFtgT3BlcmF0aW9uU3RhdGU6OkRvbmVgXSkuAAAAAAAPT3BlcmF0aW9uTGVkZ2VyAAAAAAEAAAPuAAAAIA==",
        "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==",
        "AAAAAQAAAEhTdG9yZXMgdGhlIHBlbmRpbmcgcm9sZSBob2xkZXIgYW5kIHRoZSBleHBsaWNpdCBkZWFkbGluZSBmb3IgYWNjZXB0YW5jZS4AAAAAAAAAD1BlbmRpbmdUcmFuc2ZlcgAAAAACAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==",
        "AAAAAQAAADFTdG9yYWdlIGtleSBmb3IgZW51bWVyYXRpb24gb2YgYWNjb3VudHMgcGVyIHJvbGUuAAAAAAAAAAAAAA5Sb2xlQWNjb3VudEtleQAAAAAAAgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAARyb2xlAAAAEQ==",
        "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjZXNzIGNvbnRyb2wAAAAAAAAAF0FjY2Vzc0NvbnRyb2xTdG9yYWdlS2V5AAAAAAcAAAAAAAAAAAAAAA1FeGlzdGluZ1JvbGVzAAAAAAAAAQAAAAAAAAAMUm9sZUFjY291bnRzAAAAAQAAB9AAAAAOUm9sZUFjY291bnRLZXkAAAAAAAEAAAAAAAAAB0hhc1JvbGUAAAAAAgAAABMAAAARAAAAAQAAAAAAAAARUm9sZUFjY291bnRzQ291bnQAAAAAAAABAAAAEQAAAAEAAAAAAAAACVJvbGVBZG1pbgAAAAAAAAEAAAARAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAAxQZW5kaW5nQWRtaW4=",
        "AAAAAgAAACNTdG9yYWdlIGtleXMgZm9yIGBPd25hYmxlYCB1dGlsaXR5LgAAAAAAAAAAEU93bmFibGVTdG9yYWdlS2V5AAAAAAAAAgAAAAAAAAAAAAAABU93bmVyAAAAAAAAAAAAAAAAAAAMUGVuZGluZ093bmVy",
        "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA",
        "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR",
        "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=",
        "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=",
        "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==",
        "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=",
        "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=",
        "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    name: (this as any).txFromJSON,
        queue: (this as any).txFromJSON,
        cancel: (this as any).txFromJSON,
        quorum: (this as any).txFromJSON,
        execute: (this as any).txFromJSON,
        propose: (this as any).txFromJSON,
        version: (this as any).txFromJSON,
        treasury: (this as any).txFromJSON,
        cast_vote: (this as any).txFromJSON,
        get_owner: (this as any).txFromJSON,
        has_voted: (this as any).txFromJSON,
        quorum_bps: (this as any).txFromJSON,
        set_treasury: (this as any).txFromJSON,
        voting_delay: (this as any).txFromJSON,
        counting_mode: (this as any).txFromJSON,
        voting_period: (this as any).txFromJSON,
        proposal_state: (this as any).txFromJSON,
        set_quorum_bps: (this as any).txFromJSON,
        get_proposal_id: (this as any).txFromJSON,
        set_queue_delay: (this as any).txFromJSON,
        accept_ownership: (this as any).txFromJSON,
        set_voting_delay: (this as any).txFromJSON,
        proposal_deadline: (this as any).txFromJSON,
        proposal_proposer: (this as any).txFromJSON,
        proposal_snapshot: (this as any).txFromJSON,
        set_voting_period: (this as any).txFromJSON,
        get_token_contract: (this as any).txFromJSON,
        governor_authority: (this as any).txFromJSON,
        proposal_threshold: (this as any).txFromJSON,
        renounce_ownership: (this as any).txFromJSON,
        set_token_contract: (this as any).txFromJSON,
        transfer_ownership: (this as any).txFromJSON,
        proposals_need_queuing: (this as any).txFromJSON,
        set_governor_authority: (this as any).txFromJSON,
        set_proposal_threshold: (this as any).txFromJSON
  }
}
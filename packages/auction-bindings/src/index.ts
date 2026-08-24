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




export const AuctionError = {
  /**
   * Bid placed for incorrect token ID
   */
  1201: {message:"InvalidTokenId"},
  /**
   * Bid placed after auction ended
   */
  1202: {message:"AuctionOver"},
  /**
   * Auction hasn't started yet
   */
  1203: {message:"AuctionNotStarted"},
  /**
   * Attempting to settle an active auction
   */
  1204: {message:"AuctionActive"},
  /**
   * Auction already settled
   */
  1205: {message:"AuctionSettled"},
  /**
   * First bid doesn't meet reserve price
   */
  1206: {message:"ReservePriceNotMet"},
  /**
   * Bid doesn't meet minimum increment
   */
  1207: {message:"MinBidNotMet"},
  /**
   * Invalid configuration parameters (e.g., duration < 5 minutes, zero increment)
   */
  1208: {message:"InvalidConfig"},
  /**
   * Token minting failed
   */
  1209: {message:"MintFailed"},
  /**
   * Token or payment transfer failed
   */
  1210: {message:"TransferFailed"},
  /**
   * Payment token not configured for SAC bids
   */
  1211: {message:"NoPaymentTokenSet"},
  /**
   * Auction not launched yet
   */
  1212: {message:"NotLaunched"},
  /**
   * Cannot create new auction
   */
  1213: {message:"CannotCreateAuction"},
  /**
   * Unauthorized access
   */
  1214: {message:"Unauthorized"},
  /**
   * Arithmetic overflow in calculations
   */
  1215: {message:"ArithmeticOverflow"},
  /**
   * Invalid bid amount (too low or unreasonable)
   */
  1216: {message:"InvalidBid"},
  /**
   * Inconsistent payment type between bids
   */
  1217: {message:"InconsistentPaymentType"},
  /**
   * Maximum auction extensions exceeded
   */
  1218: {message:"MaxExtensionsExceeded"},
  /**
   * Contract not initialized properly
   */
  1219: {message:"NotInitialized"},
  /**
   * Token ID exceeds valid range
   */
  1220: {message:"TokenIdOverflow"},
  /**
   * External contract call failed
   */
  1221: {message:"ExternalCallFailed"}
}













/**
 * Storage keys for auction instance data.
 */
export type DataKey = {tag: "Config", values: void} | {tag: "Auction", values: void} | {tag: "Launched", values: void};

/**
 * Payment currency type for an auction.
 * 
 * The first bidder determines which payment type (XLM or SAC token) will be
 * used for the entire auction. All subsequent bids must use the same type.
 */
export type PaymentType = {tag: "Native", values: void} | {tag: "SAC", values: readonly [string]};


/**
 * Current state of an active auction.
 * 
 * Tracks all dynamic auction data including bids, timing, and payment type.
 * Updated on every bid and reset on settlement.
 */
export interface AuctionState {
  /**
 * Unix timestamp when auction ends.
 * 
 * Can be extended if bids arrive within the time buffer (max 10 times).
 */
end_time: u64;
  /**
 * Number of time extensions applied to this auction.
 * 
 * Increments when bids extend the end time. Capped at [`MAX_AUCTION_EXTENSIONS`]
 * to prevent DoS attacks.
 */
extension_count: u32;
  /**
 * Current highest bid amount.
 * 
 * Initialized to 0 (no bids). Must exceed reserve price on first bid.
 */
highest_bid: i128;
  /**
 * Current highest bidder address.
 * 
 * `None` if no bids yet. The winner receives the minted token upon settlement.
 */
highest_bidder: Option<string>;
  /**
 * Payment type for this auction.
 * 
 * Locked on the first bid. All subsequent bids must use the same currency.
 * Resets to undetermined on next auction.
 */
payment_currency: PaymentType;
  /**
 * Whether auction has been settled.
 * 
 * `true` after `settle_auction()` or `settle_and_create_new()` completes.
 * Prevents double-settlement.
 */
settled: boolean;
  /**
 * Unix timestamp when auction started.
 * 
 * Set when auction is created (launch or post-settlement).
 */
start_time: u64;
  /**
 * The token ID being auctioned.
 * 
 * Starts at 1 and increments with each auction. The token is minted to the
 * winner upon settlement.
 */
token_id: u128;
}


/**
 * Auction configuration parameters.
 * 
 * These settings control the behavior of all auctions. The owner can modify
 * them when the contract is paused, but changes only apply to future auctions,
 * not the currently active one.
 */
export interface AuctionConfig {
  /**
 * Duration of each auction in seconds.
 * 
 * Standard auction window before time extensions. For example, 86400 = 24 hours.
 */
duration: u64;
  /**
 * Minimum bid increment as percentage (e.g., 10 = 10%).
 * 
 * Each new bid must be at least `current_bid + (current_bid * increment / 100)`.
 * Must be <= [`MAX_BID_INCREMENT_PERCENT`].
 */
min_bid_increment_percent: u32;
  /**
 * Configured SAC token address for payments.
 * 
 * The constructor requires this value to be `Some`; native XLM payments are
 * not supported. Payment type locks on the first bid of each auction.
 */
payment_token: Option<string>;
  /**
 * Minimum first bid amount.
 * 
 * Must be >= [`MIN_RESERVE_PRICE`]. Protects against dust auctions.
 */
reserve_price: i128;
  /**
 * Time buffer in seconds.
 * 
 * If a bid arrives within this window of the auction end, the end time extends
 * by the buffer amount (up to [`MAX_AUCTION_EXTENSIONS`] times).
 */
time_buffer: u64;
  /**
 * The governance token contract to mint NFTs from.
 * 
 * Must have granted mint authority to this auction contract.
 */
token_contract: string;
  /**
 * The treasury address to receive auction proceeds.
 * 
 * All winning bids are transferred to this address upon settlement.
 */
treasury: string;
}

export type UpgradeableStorageKey = {tag: "SchemaVersion", values: void};



export const MerkleDistributorError = {
  /**
   * The merkle root is not set.
   */
  1300: {message:"RootNotSet"},
  /**
   * The provided index was already claimed.
   */
  1301: {message:"IndexAlreadyClaimed"},
  /**
   * The proof is invalid.
   */
  1302: {message:"InvalidProof"}
}

/**
 * Storage keys for the data associated with `MerkleDistributor`
 */
export type MerkleDistributorStorageKey = {tag: "Root", values: void} | {tag: "Claimed", values: readonly [u32]};

/**
 * Rounding direction for division operations
 */
export type Rounding = {tag: "Floor", values: void} | {tag: "Ceil", values: void} | {tag: "Truncate", values: void};

export const SorobanFixedPointError = {
  /**
   * Arithmetic overflow occurred
   */
  1500: {message:"Overflow"},
  /**
   * Division by zero
   */
  1501: {message:"DivisionByZero"},
  /**
   * Base is outside the valid domain (e.g. `ln(x)` for `x <= 0`,
   * or `powf(x, y)` with non-positive `x` combined with float exponent).
   */
  1502: {message:"InvalidBase"}
}

export const CryptoError = {
  /**
   * The merkle proof length is out of bounds.
   */
  1400: {message:"MerkleProofOutOfBounds"},
  /**
   * The index of the leaf is out of bounds.
   */
  1401: {message:"MerkleIndexOutOfBounds"},
  /**
   * No data in hasher state.
   */
  1402: {message:"HasherEmptyState"},
  /**
   * The point is neither the canonical identity encoding nor a canonical
   * on-curve point.
   */
  1403: {message:"InvalidPoint"}
}



export const PausableError = {
  /**
   * The operation failed because the contract is paused.
   */
  1000: {message:"EnforcedPause"},
  /**
   * The operation failed because the contract is not paused.
   */
  1001: {message:"ExpectedPause"}
}

/**
 * Storage key for the pausable state
 */
export type PausableStorageKey = {tag: "Paused", values: void};

export const RoleTransferError = {
  2200: {message:"NoPendingTransfer"},
  2201: {message:"InvalidLiveUntilLedger"},
  2202: {message:"InvalidPendingAccount"},
  2203: {message:"TransferExpired"}
}


/**
 * Stores the pending role holder and the explicit deadline for acceptance.
 */
export interface PendingTransfer {
  address: string;
  live_until_ledger: u32;
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

export const OwnableError = {
  2100: {message:"OwnerNotSet"},
  2101: {message:"TransferInProgress"},
  2102: {message:"OwnerAlreadySet"}
}




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
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns true if the contract is paused, and false otherwise.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   */
  paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
   * Construct and simulate a create_bid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_bid: ({bidder, token_id, amount}: {bidder: string, token_id: u128, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<AuctionConfig>>

  /**
   * Construct and simulate a get_auction transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_auction: (options?: MethodOptions) => Promise<AssembledTransaction<AuctionState>>

  /**
   * Construct and simulate a set_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_duration: ({duration}: {duration: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_treasury: ({treasury}: {treasury: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_auction transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel the current auction and refund the highest bidder (owner only, when paused)
   * This allows the owner to cancel an auction in emergency situations
   */
  cancel_auction: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a settle_auction transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle_auction: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_time_buffer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_time_buffer: ({time_buffer}: {time_buffer: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
   * Construct and simulate a set_payment_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_payment_token: ({payment_token}: {payment_token: Option<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_reserve_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_reserve_price: ({reserve_price}: {reserve_price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
   * Construct and simulate a set_min_bid_increment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_min_bid_increment: ({min_bid_increment_percent}: {min_bid_increment_percent: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a settle_and_create_new transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * DESIGN NOTE: settle_and_create_new is intentionally permissionless.
   * Anyone can call this after an auction ends to settle it and create the next one.
   * This is a deliberate design choice to ensure auctions continue automatically.
   * The only griefing vector is settling at exact end time, which is minimal impact.
   */
  settle_and_create_new: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  declare txFromJSON: any;
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {owner, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token}: {owner: string, token_contract: string, treasury: string, duration: u64, reserve_price: i128, min_bid_increment_percent: u32, time_buffer: u64, payment_token: Option<string>},
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
    return ContractClient.deploy({owner, token_contract, treasury, duration, reserve_price, min_bid_increment_percent, time_buffer, payment_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAADEF1Y3Rpb25FcnJvcgAAABUAAAAhQmlkIHBsYWNlZCBmb3IgaW5jb3JyZWN0IHRva2VuIElEAAAAAAAADkludmFsaWRUb2tlbklkAAAAAASxAAAAHkJpZCBwbGFjZWQgYWZ0ZXIgYXVjdGlvbiBlbmRlZAAAAAAAC0F1Y3Rpb25PdmVyAAAABLIAAAAaQXVjdGlvbiBoYXNuJ3Qgc3RhcnRlZCB5ZXQAAAAAABFBdWN0aW9uTm90U3RhcnRlZAAAAAAABLMAAAAmQXR0ZW1wdGluZyB0byBzZXR0bGUgYW4gYWN0aXZlIGF1Y3Rpb24AAAAAAA1BdWN0aW9uQWN0aXZlAAAAAAAEtAAAABdBdWN0aW9uIGFscmVhZHkgc2V0dGxlZAAAAAAOQXVjdGlvblNldHRsZWQAAAAABLUAAAAkRmlyc3QgYmlkIGRvZXNuJ3QgbWVldCByZXNlcnZlIHByaWNlAAAAElJlc2VydmVQcmljZU5vdE1ldAAAAAAEtgAAACJCaWQgZG9lc24ndCBtZWV0IG1pbmltdW0gaW5jcmVtZW50AAAAAAAMTWluQmlkTm90TWV0AAAEtwAAAE1JbnZhbGlkIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycyAoZS5nLiwgZHVyYXRpb24gPCA1IG1pbnV0ZXMsIHplcm8gaW5jcmVtZW50KQAAAAAAAA1JbnZhbGlkQ29uZmlnAAAAAAAEuAAAABRUb2tlbiBtaW50aW5nIGZhaWxlZAAAAApNaW50RmFpbGVkAAAAAAS5AAAAIFRva2VuIG9yIHBheW1lbnQgdHJhbnNmZXIgZmFpbGVkAAAADlRyYW5zZmVyRmFpbGVkAAAAAAS6AAAAKVBheW1lbnQgdG9rZW4gbm90IGNvbmZpZ3VyZWQgZm9yIFNBQyBiaWRzAAAAAAAAEU5vUGF5bWVudFRva2VuU2V0AAAAAAAEuwAAABhBdWN0aW9uIG5vdCBsYXVuY2hlZCB5ZXQAAAALTm90TGF1bmNoZWQAAAAEvAAAABlDYW5ub3QgY3JlYXRlIG5ldyBhdWN0aW9uAAAAAAAAE0Nhbm5vdENyZWF0ZUF1Y3Rpb24AAAAEvQAAABNVbmF1dGhvcml6ZWQgYWNjZXNzAAAAAAxVbmF1dGhvcml6ZWQAAAS+AAAAI0FyaXRobWV0aWMgb3ZlcmZsb3cgaW4gY2FsY3VsYXRpb25zAAAAABJBcml0aG1ldGljT3ZlcmZsb3cAAAAABL8AAAAsSW52YWxpZCBiaWQgYW1vdW50ICh0b28gbG93IG9yIHVucmVhc29uYWJsZSkAAAAKSW52YWxpZEJpZAAAAAAEwAAAACZJbmNvbnNpc3RlbnQgcGF5bWVudCB0eXBlIGJldHdlZW4gYmlkcwAAAAAAF0luY29uc2lzdGVudFBheW1lbnRUeXBlAAAABMEAAAAjTWF4aW11bSBhdWN0aW9uIGV4dGVuc2lvbnMgZXhjZWVkZWQAAAAAFU1heEV4dGVuc2lvbnNFeGNlZWRlZAAAAAAABMIAAAAhQ29udHJhY3Qgbm90IGluaXRpYWxpemVkIHByb3Blcmx5AAAAAAAADk5vdEluaXRpYWxpemVkAAAAAATDAAAAHFRva2VuIElEIGV4Y2VlZHMgdmFsaWQgcmFuZ2UAAAAPVG9rZW5JZE92ZXJmbG93AAAABMQAAAAdRXh0ZXJuYWwgY29udHJhY3QgY2FsbCBmYWlsZWQAAAAAAAASRXh0ZXJuYWxDYWxsRmFpbGVkAAAAAATF",
        "AAAABQAAAAAAAAAAAAAACUJpZFBsYWNlZAAAAAAAAAEAAAAKYmlkX3BsYWNlZAAAAAAABgAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAMcGF5bWVudF90eXBlAAAH0AAAAAtQYXltZW50VHlwZQAAAAAAAAAAAAAAAAhleHRlbmRlZAAAAAEAAAAAAAAAAAAAAAxuZXdfZW5kX3RpbWUAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0JpZFJlZnVuZGVkAAAAAAEAAAAMYmlkX3JlZnVuZGVkAAAAAwAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAMcGF5bWVudF90eXBlAAAH0AAAAAtQYXltZW50VHlwZQAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25DcmVhdGVkAAAAAAABAAAAD2F1Y3Rpb25fY3JlYXRlZAAAAAADAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAApzdGFydF90aW1lAAAAAAAGAAAAAAAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADkF1Y3Rpb25TZXR0bGVkAAAAAAABAAAAD2F1Y3Rpb25fc2V0dGxlZAAAAAAEAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAABAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAMcGF5bWVudF90eXBlAAAH0AAAAAtQYXltZW50VHlwZQAAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0R1cmF0aW9uVXBkYXRlZAAAAAABAAAAEGR1cmF0aW9uX3VwZGF0ZWQAAAACAAAAAAAAAAhkdXJhdGlvbgAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAD1RyZWFzdXJ5VXBkYXRlZAAAAAABAAAAEHRyZWFzdXJ5X3VwZGF0ZWQAAAACAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEEF1Y3Rpb25DYW5jZWxsZWQAAAABAAAAEWF1Y3Rpb25fY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAAIdG9rZW5faWQAAAAKAAAAAQAAAAAAAAAGcmVhc29uAAAAAAAEAAAAAAAAAAAAAAAMY2FuY2VsbGVkX2J5AAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAEVRpbWVCdWZmZXJVcGRhdGVkAAAAAAAAAQAAABN0aW1lX2J1ZmZlcl91cGRhdGVkAAAAAAIAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAEkF1Y3Rpb25Jbml0aWFsaXplZAAAAAAAAQAAABNhdWN0aW9uX2luaXRpYWxpemVkAAAAAAgAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAADnRva2VuX2NvbnRyYWN0AAAAAAATAAAAAAAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAAAAAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAAAAAAAAAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAAAAAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAD6AAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAE1BheW1lbnRUb2tlblVwZGF0ZWQAAAAAAQAAABVwYXltZW50X3Rva2VuX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAD6AAAABMAAAAAAAAAAAAAAApjaGFuZ2VkX2J5AAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAE1Jlc2VydmVQcmljZVVwZGF0ZWQAAAAAAQAAABVyZXNlcnZlX3ByaWNlX3VwZGF0ZWQAAAAAAAACAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAAAAAACmNoYW5nZWRfYnkAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAFk1pbkJpZEluY3JlbWVudFVwZGF0ZWQAAAAAAAEAAAAZbWluX2JpZF9pbmNyZW1lbnRfdXBkYXRlZAAAAAAAAAIAAAAAAAAAGW1pbl9iaWRfaW5jcmVtZW50X3BlcmNlbnQAAAAAAAAEAAAAAAAAAAAAAAAKY2hhbmdlZF9ieQAAAAAAEwAAAAAAAAAC",
        "AAAAAgAAACdTdG9yYWdlIGtleXMgZm9yIGF1Y3Rpb24gaW5zdGFuY2UgZGF0YS4AAAAAAAAAAAdEYXRhS2V5AAAAAAMAAAAAAAAAQEF1Y3Rpb24gY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzIChkdXJhdGlvbiwgcmVzZXJ2ZSBwcmljZSwgZXRjLikAAAAGQ29uZmlnAAAAAAAAAAAANEN1cnJlbnQgYXVjdGlvbiBzdGF0ZSAodG9rZW4gSUQsIGJpZHMsIHRpbWluZywgZXRjLikAAAAHQXVjdGlvbgAAAAAAAAAASFdoZXRoZXIgdGhlIGZpcnN0IGF1Y3Rpb24gaGFzIGJlZW4gbGF1bmNoZWQgKHByZXZlbnRzIHJlLWluaXRpYWxpemF0aW9uKQAAAAhMYXVuY2hlZA==",
        "AAAAAgAAALlQYXltZW50IGN1cnJlbmN5IHR5cGUgZm9yIGFuIGF1Y3Rpb24uCgpUaGUgZmlyc3QgYmlkZGVyIGRldGVybWluZXMgd2hpY2ggcGF5bWVudCB0eXBlIChYTE0gb3IgU0FDIHRva2VuKSB3aWxsIGJlCnVzZWQgZm9yIHRoZSBlbnRpcmUgYXVjdGlvbi4gQWxsIHN1YnNlcXVlbnQgYmlkcyBtdXN0IHVzZSB0aGUgc2FtZSB0eXBlLgAAAAAAAAAAAAALUGF5bWVudFR5cGUAAAAAAgAAAAAAAAAkTmF0aXZlIFhMTSAoU3RlbGxhciBsdW1lbnMpIHBheW1lbnQuAAAABk5hdGl2ZQAAAAAAAQAAAGZTQUMgKFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QpIHRva2VuIHBheW1lbnQuCgpUaGUgYWRkcmVzcyBpZGVudGlmaWVzIHdoaWNoIHNwZWNpZmljIFNBQyB0b2tlbiBjb250cmFjdC4AAAAAAANTQUMAAAAAAQAAABM=",
        "AAAAAQAAAJxDdXJyZW50IHN0YXRlIG9mIGFuIGFjdGl2ZSBhdWN0aW9uLgoKVHJhY2tzIGFsbCBkeW5hbWljIGF1Y3Rpb24gZGF0YSBpbmNsdWRpbmcgYmlkcywgdGltaW5nLCBhbmQgcGF5bWVudCB0eXBlLgpVcGRhdGVkIG9uIGV2ZXJ5IGJpZCBhbmQgcmVzZXQgb24gc2V0dGxlbWVudC4AAAAAAAAADEF1Y3Rpb25TdGF0ZQAAAAgAAABoVW5peCB0aW1lc3RhbXAgd2hlbiBhdWN0aW9uIGVuZHMuCgpDYW4gYmUgZXh0ZW5kZWQgaWYgYmlkcyBhcnJpdmUgd2l0aGluIHRoZSB0aW1lIGJ1ZmZlciAobWF4IDEwIHRpbWVzKS4AAAAIZW5kX3RpbWUAAAAGAAAAmk51bWJlciBvZiB0aW1lIGV4dGVuc2lvbnMgYXBwbGllZCB0byB0aGlzIGF1Y3Rpb24uCgpJbmNyZW1lbnRzIHdoZW4gYmlkcyBleHRlbmQgdGhlIGVuZCB0aW1lLiBDYXBwZWQgYXQgW2BNQVhfQVVDVElPTl9FWFRFTlNJT05TYF0KdG8gcHJldmVudCBEb1MgYXR0YWNrcy4AAAAAAA9leHRlbnNpb25fY291bnQAAAAABAAAAGBDdXJyZW50IGhpZ2hlc3QgYmlkIGFtb3VudC4KCkluaXRpYWxpemVkIHRvIDAgKG5vIGJpZHMpLiBNdXN0IGV4Y2VlZCByZXNlcnZlIHByaWNlIG9uIGZpcnN0IGJpZC4AAAALaGlnaGVzdF9iaWQAAAAACwAAAG1DdXJyZW50IGhpZ2hlc3QgYmlkZGVyIGFkZHJlc3MuCgpgTm9uZWAgaWYgbm8gYmlkcyB5ZXQuIFRoZSB3aW5uZXIgcmVjZWl2ZXMgdGhlIG1pbnRlZCB0b2tlbiB1cG9uIHNldHRsZW1lbnQuAAAAAAAADmhpZ2hlc3RfYmlkZGVyAAAAAAPoAAAAEwAAAJBQYXltZW50IHR5cGUgZm9yIHRoaXMgYXVjdGlvbi4KCkxvY2tlZCBvbiB0aGUgZmlyc3QgYmlkLiBBbGwgc3Vic2VxdWVudCBiaWRzIG11c3QgdXNlIHRoZSBzYW1lIGN1cnJlbmN5LgpSZXNldHMgdG8gdW5kZXRlcm1pbmVkIG9uIG5leHQgYXVjdGlvbi4AAAAQcGF5bWVudF9jdXJyZW5jeQAAB9AAAAALUGF5bWVudFR5cGUAAAAAhldoZXRoZXIgYXVjdGlvbiBoYXMgYmVlbiBzZXR0bGVkLgoKYHRydWVgIGFmdGVyIGBzZXR0bGVfYXVjdGlvbigpYCBvciBgc2V0dGxlX2FuZF9jcmVhdGVfbmV3KClgIGNvbXBsZXRlcy4KUHJldmVudHMgZG91YmxlLXNldHRsZW1lbnQuAAAAAAAHc2V0dGxlZAAAAAABAAAAXlVuaXggdGltZXN0YW1wIHdoZW4gYXVjdGlvbiBzdGFydGVkLgoKU2V0IHdoZW4gYXVjdGlvbiBpcyBjcmVhdGVkIChsYXVuY2ggb3IgcG9zdC1zZXR0bGVtZW50KS4AAAAAAApzdGFydF90aW1lAAAAAAAGAAAAf1RoZSB0b2tlbiBJRCBiZWluZyBhdWN0aW9uZWQuCgpTdGFydHMgYXQgMSBhbmQgaW5jcmVtZW50cyB3aXRoIGVhY2ggYXVjdGlvbi4gVGhlIHRva2VuIGlzIG1pbnRlZCB0byB0aGUKd2lubmVyIHVwb24gc2V0dGxlbWVudC4AAAAACHRva2VuX2lkAAAACg==",
        "AAAAAQAAANdBdWN0aW9uIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVycy4KClRoZXNlIHNldHRpbmdzIGNvbnRyb2wgdGhlIGJlaGF2aW9yIG9mIGFsbCBhdWN0aW9ucy4gVGhlIG93bmVyIGNhbiBtb2RpZnkKdGhlbSB3aGVuIHRoZSBjb250cmFjdCBpcyBwYXVzZWQsIGJ1dCBjaGFuZ2VzIG9ubHkgYXBwbHkgdG8gZnV0dXJlIGF1Y3Rpb25zLApub3QgdGhlIGN1cnJlbnRseSBhY3RpdmUgb25lLgAAAAAAAAAADUF1Y3Rpb25Db25maWcAAAAAAAAHAAAAdER1cmF0aW9uIG9mIGVhY2ggYXVjdGlvbiBpbiBzZWNvbmRzLgoKU3RhbmRhcmQgYXVjdGlvbiB3aW5kb3cgYmVmb3JlIHRpbWUgZXh0ZW5zaW9ucy4gRm9yIGV4YW1wbGUsIDg2NDAwID0gMjQgaG91cnMuAAAACGR1cmF0aW9uAAAABgAAAK9NaW5pbXVtIGJpZCBpbmNyZW1lbnQgYXMgcGVyY2VudGFnZSAoZS5nLiwgMTAgPSAxMCUpLgoKRWFjaCBuZXcgYmlkIG11c3QgYmUgYXQgbGVhc3QgYGN1cnJlbnRfYmlkICsgKGN1cnJlbnRfYmlkICogaW5jcmVtZW50IC8gMTAwKWAuCk11c3QgYmUgPD0gW2BNQVhfQklEX0lOQ1JFTUVOVF9QRVJDRU5UYF0uAAAAABltaW5fYmlkX2luY3JlbWVudF9wZXJjZW50AAAAAAAABAAAALlDb25maWd1cmVkIFNBQyB0b2tlbiBhZGRyZXNzIGZvciBwYXltZW50cy4KClRoZSBjb25zdHJ1Y3RvciByZXF1aXJlcyB0aGlzIHZhbHVlIHRvIGJlIGBTb21lYDsgbmF0aXZlIFhMTSBwYXltZW50cyBhcmUKbm90IHN1cHBvcnRlZC4gUGF5bWVudCB0eXBlIGxvY2tzIG9uIHRoZSBmaXJzdCBiaWQgb2YgZWFjaCBhdWN0aW9uLgAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAD6AAAABMAAABcTWluaW11bSBmaXJzdCBiaWQgYW1vdW50LgoKTXVzdCBiZSA+PSBbYE1JTl9SRVNFUlZFX1BSSUNFYF0uIFByb3RlY3RzIGFnYWluc3QgZHVzdCBhdWN0aW9ucy4AAAANcmVzZXJ2ZV9wcmljZQAAAAAAAAsAAACkVGltZSBidWZmZXIgaW4gc2Vjb25kcy4KCklmIGEgYmlkIGFycml2ZXMgd2l0aGluIHRoaXMgd2luZG93IG9mIHRoZSBhdWN0aW9uIGVuZCwgdGhlIGVuZCB0aW1lIGV4dGVuZHMKYnkgdGhlIGJ1ZmZlciBhbW91bnQgKHVwIHRvIFtgTUFYX0FVQ1RJT05fRVhURU5TSU9OU2BdIHRpbWVzKS4AAAALdGltZV9idWZmZXIAAAAABgAAAGxUaGUgZ292ZXJuYW5jZSB0b2tlbiBjb250cmFjdCB0byBtaW50IE5GVHMgZnJvbS4KCk11c3QgaGF2ZSBncmFudGVkIG1pbnQgYXV0aG9yaXR5IHRvIHRoaXMgYXVjdGlvbiBjb250cmFjdC4AAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAB0VGhlIHRyZWFzdXJ5IGFkZHJlc3MgdG8gcmVjZWl2ZSBhdWN0aW9uIHByb2NlZWRzLgoKQWxsIHdpbm5pbmcgYmlkcyBhcmUgdHJhbnNmZXJyZWQgdG8gdGhpcyBhZGRyZXNzIHVwb24gc2V0dGxlbWVudC4AAAAIdHJlYXN1cnkAAAAT",
        "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA",
        "AAAAAAAAAHFSZXR1cm5zIHRydWUgaWYgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZCwgYW5kIGZhbHNlIG90aGVyd2lzZS4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgAAAAAAAAZwYXVzZWQAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAA",
        "AAAAAAAAAJBSZXR1cm5zIGBTb21lKEFkZHJlc3MpYCBpZiBvd25lcnNoaXAgaXMgc2V0LCBvciBgTm9uZWAgaWYgb3duZXJzaGlwIGhhcwpiZWVuIHJlbm91bmNlZC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4AAAAJZ2V0X293bmVyAAAAAAAAAAAAAAEAAAPoAAAAEw==",
        "AAAAAAAAAAAAAAAKY3JlYXRlX2JpZAAAAAAAAwAAAAAAAAAGYmlkZGVyAAAAAAATAAAAAAAAAAh0b2tlbl9pZAAAAAoAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAADUF1Y3Rpb25Db25maWcAAAA=",
        "AAAAAAAAAAAAAAALZ2V0X2F1Y3Rpb24AAAAAAAAAAAEAAAfQAAAADEF1Y3Rpb25TdGF0ZQ==",
        "AAAAAAAAAAAAAAAMc2V0X2R1cmF0aW9uAAAAAQAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAMc2V0X3RyZWFzdXJ5AAAAAQAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAgAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAOdG9rZW5fY29udHJhY3QAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAIZHVyYXRpb24AAAAGAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAAAAAADXBheW1lbnRfdG9rZW4AAAAAAAPoAAAAEwAAAAA=",
        "AAAAAAAAAJVDYW5jZWwgdGhlIGN1cnJlbnQgYXVjdGlvbiBhbmQgcmVmdW5kIHRoZSBoaWdoZXN0IGJpZGRlciAob3duZXIgb25seSwgd2hlbiBwYXVzZWQpClRoaXMgYWxsb3dzIHRoZSBvd25lciB0byBjYW5jZWwgYW4gYXVjdGlvbiBpbiBlbWVyZ2VuY3kgc2l0dWF0aW9ucwAAAAAAAA5jYW5jZWxfYXVjdGlvbgAAAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAOc2V0dGxlX2F1Y3Rpb24AAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAAPc2V0X3RpbWVfYnVmZmVyAAAAAAEAAAAAAAAAC3RpbWVfYnVmZmVyAAAAAAYAAAAA",
        "AAAAAAAAATBBY2NlcHRzIGEgcGVuZGluZyBvd25lcnNoaXAgdHJhbnNmZXIuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsib3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZCJdYAoqIGRhdGEgLSBgW25ld19vd25lcjogQWRkcmVzc11gAAAAEGFjY2VwdF9vd25lcnNoaXAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAARc2V0X3BheW1lbnRfdG9rZW4AAAAAAAABAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAD6AAAABMAAAAA",
        "AAAAAAAAAAAAAAARc2V0X3Jlc2VydmVfcHJpY2UAAAAAAAABAAAAAAAAAA1yZXNlcnZlX3ByaWNlAAAAAAAACwAAAAA=",
        "AAAAAAAAAYVSZW5vdW5jZXMgb3duZXJzaGlwIG9mIHRoZSBjb250cmFjdC4KClBlcm1hbmVudGx5IHJlbW92ZXMgdGhlIG93bmVyLCBkaXNhYmxpbmcgYWxsIGZ1bmN0aW9ucyBnYXRlZCBieQpgI1tvbmx5X293bmVyXWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gdGhlIFNvcm9iYW4gZW52aXJvbm1lbnQuCgojIEVycm9ycwoKKiBbYE93bmFibGVFcnJvcjo6VHJhbnNmZXJJblByb2dyZXNzYF0gLSBJZiB0aGVyZSBpcyBhIHBlbmRpbmcgb3duZXJzaGlwCnRyYW5zZmVyLgoqIFtgT3duYWJsZUVycm9yOjpPd25lck5vdFNldGBdIC0gSWYgdGhlIG93bmVyIGlzIG5vdCBzZXQuCgojIE5vdGVzCgoqIEF1dGhvcml6YXRpb24gZm9yIHRoZSBjdXJyZW50IG93bmVyIGlzIHJlcXVpcmVkLgAAAAAAABJyZW5vdW5jZV9vd25lcnNoaXAAAAAAAAAAAAAA",
        "AAAAAAAAA45Jbml0aWF0ZXMgYSAyLXN0ZXAgb3duZXJzaGlwIHRyYW5zZmVyIHRvIGEgbmV3IGFkZHJlc3MuCgpSZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gdGhlIGN1cnJlbnQgb3duZXIuIFRoZSBuZXcgb3duZXIgbXVzdCBsYXRlcgpjYWxsIGBhY2NlcHRfb3duZXJzaGlwKClgIHRvIGNvbXBsZXRlIHRoZSB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byB0aGUgU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgbmV3X293bmVyYCAtIFRoZSBwcm9wb3NlZCBuZXcgb3duZXIuCiogYGxpdmVfdW50aWxfbGVkZ2VyYCAtIExlZGdlciBudW1iZXIgdW50aWwgd2hpY2ggdGhlIG5ldyBvd25lciBjYW4KYWNjZXB0LiBBIHZhbHVlIG9mIGAwYCBjYW5jZWxzIGFueSBwZW5kaW5nIHRyYW5zZmVyLgoKIyBFcnJvcnMKCiogW2BPd25hYmxlRXJyb3I6Ok93bmVyTm90U2V0YF0gLSBJZiB0aGUgb3duZXIgaXMgbm90IHNldC4KKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgb3duZXIgaXMgcmVxdWlyZWQuAAAAAAASdHJhbnNmZXJfb3duZXJzaGlwAAAAAAACAAAAAAAAAAluZXdfb3duZXIAAAAAAAATAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAA",
        "AAAAAAAAAAAAAAAVc2V0X21pbl9iaWRfaW5jcmVtZW50AAAAAAAAAQAAAAAAAAAZbWluX2JpZF9pbmNyZW1lbnRfcGVyY2VudAAAAAAAAAQAAAAA",
        "AAAAAAAAATNERVNJR04gTk9URTogc2V0dGxlX2FuZF9jcmVhdGVfbmV3IGlzIGludGVudGlvbmFsbHkgcGVybWlzc2lvbmxlc3MuCkFueW9uZSBjYW4gY2FsbCB0aGlzIGFmdGVyIGFuIGF1Y3Rpb24gZW5kcyB0byBzZXR0bGUgaXQgYW5kIGNyZWF0ZSB0aGUgbmV4dCBvbmUuClRoaXMgaXMgYSBkZWxpYmVyYXRlIGRlc2lnbiBjaG9pY2UgdG8gZW5zdXJlIGF1Y3Rpb25zIGNvbnRpbnVlIGF1dG9tYXRpY2FsbHkuClRoZSBvbmx5IGdyaWVmaW5nIHZlY3RvciBpcyBzZXR0bGluZyBhdCBleGFjdCBlbmQgdGltZSwgd2hpY2ggaXMgbWluaW1hbCBpbXBhY3QuAAAAABVzZXR0bGVfYW5kX2NyZWF0ZV9uZXcAAAAAAAAAAAAAAA==",
        "AAAAAgAAAAAAAAAAAAAAFVVwZ3JhZGVhYmxlU3RvcmFnZUtleQAAAAAAAAEAAAAAAAAAAAAAAA1TY2hlbWFWZXJzaW9uAAAA",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIG1lcmtsZSByb290IGlzIHNldC4AAAAAAAAAAAAHU2V0Um9vdAAAAAABAAAACHNldF9yb290AAAAAQAAAAAAAAAEcm9vdAAAAA4AAAAAAAAAAg==",
        "AAAABQAAACdFdmVudCBlbWl0dGVkIHdoZW4gYW4gaW5kZXggaXMgY2xhaW1lZC4AAAAAAAAAAApTZXRDbGFpbWVkAAAAAAABAAAAC3NldF9jbGFpbWVkAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAFk1lcmtsZURpc3RyaWJ1dG9yRXJyb3IAAAAAAAMAAAAbVGhlIG1lcmtsZSByb290IGlzIG5vdCBzZXQuAAAAAApSb290Tm90U2V0AAAAAAUUAAAAJ1RoZSBwcm92aWRlZCBpbmRleCB3YXMgYWxyZWFkeSBjbGFpbWVkLgAAAAATSW5kZXhBbHJlYWR5Q2xhaW1lZAAAAAUVAAAAFVRoZSBwcm9vZiBpcyBpbnZhbGlkLgAAAAAAAAxJbnZhbGlkUHJvb2YAAAUW",
        "AAAAAgAAAD1TdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCBgTWVya2xlRGlzdHJpYnV0b3JgAAAAAAAAAAAAABtNZXJrbGVEaXN0cmlidXRvclN0b3JhZ2VLZXkAAAAAAgAAAAAAAAAoVGhlIE1lcmtsZSByb290IG9mIHRoZSBkaXN0cmlidXRpb24gdHJlZQAAAARSb290AAAAAQAAACNNYXBzIGFuIGluZGV4IHRvIGl0cyBjbGFpbWVkIHN0YXR1cwAAAAAHQ2xhaW1lZAAAAAABAAAABA==",
        "AAAAAgAAACpSb3VuZGluZyBkaXJlY3Rpb24gZm9yIGRpdmlzaW9uIG9wZXJhdGlvbnMAAAAAAAAAAAAIUm91bmRpbmcAAAADAAAAAAAAACVSb3VuZCB0b3dhcmQgbmVnYXRpdmUgaW5maW5pdHkgKGRvd24pAAAAAAAABUZsb29yAAAAAAAAAAAAACNSb3VuZCB0b3dhcmQgcG9zaXRpdmUgaW5maW5pdHkgKHVwKQAAAAAEQ2VpbAAAAAAAAAAeUm91bmQgdG93YXJkIHplcm8gKHRydW5jYXRpb24pAAAAAAAIVHJ1bmNhdGU=",
        "AAAABAAAAAAAAAAAAAAAFlNvcm9iYW5GaXhlZFBvaW50RXJyb3IAAAAAAAMAAAAcQXJpdGhtZXRpYyBvdmVyZmxvdyBvY2N1cnJlZAAAAAhPdmVyZmxvdwAABdwAAAAQRGl2aXNpb24gYnkgemVybwAAAA5EaXZpc2lvbkJ5WmVybwAAAAAF3QAAAIFCYXNlIGlzIG91dHNpZGUgdGhlIHZhbGlkIGRvbWFpbiAoZS5nLiBgbG4oeClgIGZvciBgeCA8PSAwYCwKb3IgYHBvd2YoeCwgeSlgIHdpdGggbm9uLXBvc2l0aXZlIGB4YCBjb21iaW5lZCB3aXRoIGZsb2F0IGV4cG9uZW50KS4AAAAAAAALSW52YWxpZEJhc2UAAAAF3g==",
        "AAAABAAAAAAAAAAAAAAAC0NyeXB0b0Vycm9yAAAAAAQAAAApVGhlIG1lcmtsZSBwcm9vZiBsZW5ndGggaXMgb3V0IG9mIGJvdW5kcy4AAAAAAAAWTWVya2xlUHJvb2ZPdXRPZkJvdW5kcwAAAAAFeAAAACdUaGUgaW5kZXggb2YgdGhlIGxlYWYgaXMgb3V0IG9mIGJvdW5kcy4AAAAAFk1lcmtsZUluZGV4T3V0T2ZCb3VuZHMAAAAABXkAAAAYTm8gZGF0YSBpbiBoYXNoZXIgc3RhdGUuAAAAEEhhc2hlckVtcHR5U3RhdGUAAAV6AAAAVFRoZSBwb2ludCBpcyBuZWl0aGVyIHRoZSBjYW5vbmljYWwgaWRlbnRpdHkgZW5jb2Rpbmcgbm9yIGEgY2Fub25pY2FsCm9uLWN1cnZlIHBvaW50LgAAAAxJbnZhbGlkUG9pbnQAAAV7",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAAAAAAAAGUGF1c2VkAAAAAAABAAAABnBhdXNlZAAAAAAAAAAAAAI=",
        "AAAABQAAACxFdmVudCBlbWl0dGVkIHdoZW4gdGhlIGNvbnRyYWN0IGlzIHVucGF1c2VkLgAAAAAAAAAIVW5wYXVzZWQAAAABAAAACHVucGF1c2VkAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAADVBhdXNhYmxlRXJyb3IAAAAAAAACAAAANFRoZSBvcGVyYXRpb24gZmFpbGVkIGJlY2F1c2UgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAANRW5mb3JjZWRQYXVzZQAAAAAAA+gAAAA4VGhlIG9wZXJhdGlvbiBmYWlsZWQgYmVjYXVzZSB0aGUgY29udHJhY3QgaXMgbm90IHBhdXNlZC4AAAANRXhwZWN0ZWRQYXVzZQAAAAAAA+k=",
        "AAAAAgAAACJTdG9yYWdlIGtleSBmb3IgdGhlIHBhdXNhYmxlIHN0YXRlAAAAAAAAAAAAElBhdXNhYmxlU3RvcmFnZUtleQAAAAAAAQAAAAAAAAAySW5kaWNhdGVzIHdoZXRoZXIgdGhlIGNvbnRyYWN0IGlzIGluIHBhdXNlZCBzdGF0ZS4AAAAAAAZQYXVzZWQAAA==",
        "AAAABAAAAAAAAAAAAAAAEVJvbGVUcmFuc2ZlckVycm9yAAAAAAAABAAAAAAAAAARTm9QZW5kaW5nVHJhbnNmZXIAAAAAAAiYAAAAAAAAABZJbnZhbGlkTGl2ZVVudGlsTGVkZ2VyAAAAAAiZAAAAAAAAABVJbnZhbGlkUGVuZGluZ0FjY291bnQAAAAAAAiaAAAAAAAAAA9UcmFuc2ZlckV4cGlyZWQAAAAImw==",
        "AAAAAQAAAEhTdG9yZXMgdGhlIHBlbmRpbmcgcm9sZSBob2xkZXIgYW5kIHRoZSBleHBsaWNpdCBkZWFkbGluZSBmb3IgYWNjZXB0YW5jZS4AAAAAAAAAD1BlbmRpbmdUcmFuc2ZlcgAAAAACAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAAEkFjY2Vzc0NvbnRyb2xFcnJvcgAAAAAACwAAAAAAAAAMVW5hdXRob3JpemVkAAAH0AAAAAAAAAALQWRtaW5Ob3RTZXQAAAAH0QAAAAAAAAAQSW5kZXhPdXRPZkJvdW5kcwAAB9IAAAAAAAAAEUFkbWluUm9sZU5vdEZvdW5kAAAAAAAH0wAAAAAAAAASUm9sZUNvdW50SXNOb3RaZXJvAAAAAAfUAAAAAAAAAAxSb2xlTm90Rm91bmQAAAfVAAAAAAAAAA9BZG1pbkFscmVhZHlTZXQAAAAH1gAAAAAAAAALUm9sZU5vdEhlbGQAAAAH1wAAAAAAAAALUm9sZUlzRW1wdHkAAAAH2AAAAAAAAAASVHJhbnNmZXJJblByb2dyZXNzAAAAAAfZAAAAAAAAABBNYXhSb2xlc0V4Y2VlZGVkAAAH2g==",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC",
        "AAAAAQAAADFTdG9yYWdlIGtleSBmb3IgZW51bWVyYXRpb24gb2YgYWNjb3VudHMgcGVyIHJvbGUuAAAAAAAAAAAAAA5Sb2xlQWNjb3VudEtleQAAAAAAAgAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAARyb2xlAAAAEQ==",
        "AAAAAgAAADxTdG9yYWdlIGtleXMgZm9yIHRoZSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgYWNjZXNzIGNvbnRyb2wAAAAAAAAAF0FjY2Vzc0NvbnRyb2xTdG9yYWdlS2V5AAAAAAcAAAAAAAAAAAAAAA1FeGlzdGluZ1JvbGVzAAAAAAAAAQAAAAAAAAAMUm9sZUFjY291bnRzAAAAAQAAB9AAAAAOUm9sZUFjY291bnRLZXkAAAAAAAEAAAAAAAAAB0hhc1JvbGUAAAAAAgAAABMAAAARAAAAAQAAAAAAAAARUm9sZUFjY291bnRzQ291bnQAAAAAAAABAAAAEQAAAAEAAAAAAAAACVJvbGVBZG1pbgAAAAAAAAEAAAARAAAAAAAAAAAAAAAFQWRtaW4AAAAAAAAAAAAAAAAAAAxQZW5kaW5nQWRtaW4=",
        "AAAABAAAAAAAAAAAAAAADE93bmFibGVFcnJvcgAAAAMAAAAAAAAAC093bmVyTm90U2V0AAAACDQAAAAAAAAAElRyYW5zZmVySW5Qcm9ncmVzcwAAAAAINQAAAAAAAAAPT3duZXJBbHJlYWR5U2V0AAAACDY=",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGluaXRpYXRlZC4AAAAAAAAAAAART3duZXJzaGlwVHJhbnNmZXIAAAAAAAABAAAAEm93bmVyc2hpcF90cmFuc2ZlcgAAAAAAAwAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAAAAABFsaXZlX3VudGlsX2xlZGdlcgAAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAACpFdmVudCBlbWl0dGVkIHdoZW4gb3duZXJzaGlwIGlzIHJlbm91bmNlZC4AAAAAAAAAAAAST3duZXJzaGlwUmVub3VuY2VkAAAAAAABAAAAE293bmVyc2hpcF9yZW5vdW5jZWQAAAAAAQAAAAAAAAAJb2xkX293bmVyAAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADZFdmVudCBlbWl0dGVkIHdoZW4gYW4gb3duZXJzaGlwIHRyYW5zZmVyIGlzIGNvbXBsZXRlZC4AAAAAAAAAAAAaT3duZXJzaGlwVHJhbnNmZXJDb21wbGV0ZWQAAAAAAAEAAAAcb3duZXJzaGlwX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAEAAAAAAAAACW5ld19vd25lcgAAAAAAABMAAAAAAAAAAg==",
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
    pause: (this as any).txFromJSON,
        paused: (this as any).txFromJSON,
        unpause: (this as any).txFromJSON,
        get_owner: (this as any).txFromJSON,
        create_bid: (this as any).txFromJSON,
        get_config: (this as any).txFromJSON,
        get_auction: (this as any).txFromJSON,
        set_duration: (this as any).txFromJSON,
        set_treasury: (this as any).txFromJSON,
        cancel_auction: (this as any).txFromJSON,
        settle_auction: (this as any).txFromJSON,
        set_time_buffer: (this as any).txFromJSON,
        accept_ownership: (this as any).txFromJSON,
        set_payment_token: (this as any).txFromJSON,
        set_reserve_price: (this as any).txFromJSON,
        renounce_ownership: (this as any).txFromJSON,
        transfer_ownership: (this as any).txFromJSON,
        set_min_bid_increment: (this as any).txFromJSON,
        settle_and_create_new: (this as any).txFromJSON
  }
}
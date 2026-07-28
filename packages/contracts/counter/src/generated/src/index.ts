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




export type DataKey = {tag: "Admin", values: void} | {tag: "GlobalCount", values: void} | {tag: "CooldownSecs", values: void} | {tag: "TotalSupply", values: void} | {tag: "TokenName", values: void} | {tag: "TokenSymbol", values: void} | {tag: "Decimals", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "UserStats", values: readonly [string]} | {tag: "BattleRecord", values: readonly [string]} | {tag: "Allowance", values: readonly [string, string]} | {tag: "Cooldown", values: readonly [string]};


export interface UserStats {
  last_action: u64;
  total_kicks: u32;
  total_punches: u32;
}


export interface BattleRecord {
  losses: u32;
  total_battles: u32;
  wins: u32;
}


export interface AllowanceValue {
  amount: i128;
  live_until_ledger: u32;
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a kick transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * KICK - Actor kicks target, minting 2 tokens to target
   * Demonstrates: Token minting with higher reward
   */
  kick: ({from, to}: {from: string, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a punch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * PUNCH - Actor punches target, minting 1 token to target
   * Demonstrates: Token minting, action-based gameplay, TTL extension
   */
  punch: ({from, to}: {from: string, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a battle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * BATTLE - Two users battle, winner determined by token balance
   * Demonstrates: Competitive multi-sig with mint/burn mechanics
   */
  battle: ({attacker, defender}: {attacker: string, defender: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve: ({from, spender, amount, live_until_ledger}: {from: string, spender: string, amount: i128, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allowance: ({from, spender}: {from: string, spender: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a burn_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn_from: ({spender, from, amount}: {spender: string, from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get user's token balance (SEP-0041 compatible via balance() too)
   */
  get_count: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get user's detailed statistics
   */
  get_stats: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<UserStats>>>

  /**
   * Construct and simulate a heavy_kick transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * HEAVY KICK - Three users jointly kick a target, minting 6 tokens total
   * Demonstrates: Triple multi-signature authorization
   */
  heavy_kick: ({user1, user2, user3, target}: {user1: string, user2: string, user3: string, target: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the contract with token metadata and admin
   * SEP-0041 compliant initialization
   */
  initialize: ({admin, name, symbol, decimals}: {admin: string, name: string, symbol: string, decimals: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a joint_punch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * JOINT PUNCH - Two users jointly punch a target, minting 4 tokens total
   * Demonstrates: Multi-signature authorization with require_auth() x2
   */
  joint_punch: ({user1, user2, target}: {user1: string, user2: string, target: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a reset_global transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reset global counter (admin only)
   */
  reset_global: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a extend_my_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Manually extend TTL for your balance and stats
   * Demonstrates: Manual TTL extension to prevent expiry
   */
  extend_my_ttl: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_from: ({spender, from, to, amount}: {spender: string, from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_on_cooldown transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Check if user is on cooldown
   */
  is_on_cooldown: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a transfer_points transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * TRANSFER POINTS - Transfer tokens between two users
   * Demonstrates: Both sender and receiver must authorize (SEP-0041 compliant)
   */
  transfer_points: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_global_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get global counter (sum of all actions)
   */
  get_global_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get total token supply (SEP-0041)
   */
  get_total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_battle_record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get user's battle record
   */
  get_battle_record: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<BattleRecord>>>

  /**
   * Construct and simulate a cooldown_remaining transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get seconds remaining on cooldown
   */
  cooldown_remaining: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a get_cooldown_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get current cooldown configuration
   */
  get_cooldown_duration: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a set_cooldown_duration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set cooldown duration in seconds (admin only)
   */
  set_cooldown_duration: ({admin, seconds}: {admin: string, seconds: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAALR2xvYmFsQ291bnQAAAAAAAAAAAAAAAAMQ29vbGRvd25TZWNzAAAAAAAAAAAAAAALVG90YWxTdXBwbHkAAAAAAAAAAAAAAAAJVG9rZW5OYW1lAAAAAAAAAAAAAAAAAAALVG9rZW5TeW1ib2wAAAAAAAAAAAAAAAAIRGVjaW1hbHMAAAABAAAAAAAAAAdCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAJVXNlclN0YXRzAAAAAAAAAQAAABMAAAABAAAAAAAAAAxCYXR0bGVSZWNvcmQAAAABAAAAEwAAAAEAAAAAAAAACUFsbG93YW5jZQAAAAAAAAIAAAATAAAAEwAAAAEAAAAAAAAACENvb2xkb3duAAAAAQAAABM=",
        "AAAAAQAAAAAAAAAAAAAACVVzZXJTdGF0cwAAAAAAAAMAAAAAAAAAC2xhc3RfYWN0aW9uAAAAAAYAAAAAAAAAC3RvdGFsX2tpY2tzAAAAAAQAAAAAAAAADXRvdGFsX3B1bmNoZXMAAAAAAAAE",
        "AAAAAQAAAAAAAAAAAAAADEJhdHRsZVJlY29yZAAAAAMAAAAAAAAABmxvc3NlcwAAAAAABAAAAAAAAAANdG90YWxfYmF0dGxlcwAAAAAAAAQAAAAAAAAABHdpbnMAAAAE",
        "AAAAAQAAAAAAAAAAAAAADkFsbG93YW5jZVZhbHVlAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABA==",
        "AAAAAAAAAAAAAAAEYnVybgAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAGRLSUNLIC0gQWN0b3Iga2lja3MgdGFyZ2V0LCBtaW50aW5nIDIgdG9rZW5zIHRvIHRhcmdldApEZW1vbnN0cmF0ZXM6IFRva2VuIG1pbnRpbmcgd2l0aCBoaWdoZXIgcmV3YXJkAAAABGtpY2sAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAHlQVU5DSCAtIEFjdG9yIHB1bmNoZXMgdGFyZ2V0LCBtaW50aW5nIDEgdG9rZW4gdG8gdGFyZ2V0CkRlbW9uc3RyYXRlczogVG9rZW4gbWludGluZywgYWN0aW9uLWJhc2VkIGdhbWVwbGF5LCBUVEwgZXh0ZW5zaW9uAAAAAAAABXB1bmNoAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAHpCQVRUTEUgLSBUd28gdXNlcnMgYmF0dGxlLCB3aW5uZXIgZGV0ZXJtaW5lZCBieSB0b2tlbiBiYWxhbmNlCkRlbW9uc3RyYXRlczogQ29tcGV0aXRpdmUgbXVsdGktc2lnIHdpdGggbWludC9idXJuIG1lY2hhbmljcwAAAAAABmJhdHRsZQAAAAAAAgAAAAAAAAAIYXR0YWNrZXIAAAATAAAAAAAAAAhkZWZlbmRlcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABQAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAJYnVybl9mcm9tAAAAAAAAAwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAEBHZXQgdXNlcidzIHRva2VuIGJhbGFuY2UgKFNFUC0wMDQxIGNvbXBhdGlibGUgdmlhIGJhbGFuY2UoKSB0b28pAAAACWdldF9jb3VudAAAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAB5HZXQgdXNlcidzIGRldGFpbGVkIHN0YXRpc3RpY3MAAAAAAAlnZXRfc3RhdHMAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPoAAAH0AAAAAlVc2VyU3RhdHMAAAA=",
        "AAAAAAAAAHlIRUFWWSBLSUNLIC0gVGhyZWUgdXNlcnMgam9pbnRseSBraWNrIGEgdGFyZ2V0LCBtaW50aW5nIDYgdG9rZW5zIHRvdGFsCkRlbW9uc3RyYXRlczogVHJpcGxlIG11bHRpLXNpZ25hdHVyZSBhdXRob3JpemF0aW9uAAAAAAAACmhlYXZ5X2tpY2sAAAAAAAQAAAAAAAAABXVzZXIxAAAAAAAAEwAAAAAAAAAFdXNlcjIAAAAAAAATAAAAAAAAAAV1c2VyMwAAAAAAABMAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAFdJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIHRva2VuIG1ldGFkYXRhIGFuZCBhZG1pbgpTRVAtMDA0MSBjb21wbGlhbnQgaW5pdGlhbGl6YXRpb24AAAAACmluaXRpYWxpemUAAAAAAAQAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAEbmFtZQAAABAAAAAAAAAABnN5bWJvbAAAAAAAEAAAAAAAAAAIZGVjaW1hbHMAAAAEAAAAAA==",
        "AAAAAAAAAIlKT0lOVCBQVU5DSCAtIFR3byB1c2VycyBqb2ludGx5IHB1bmNoIGEgdGFyZ2V0LCBtaW50aW5nIDQgdG9rZW5zIHRvdGFsCkRlbW9uc3RyYXRlczogTXVsdGktc2lnbmF0dXJlIGF1dGhvcml6YXRpb24gd2l0aCByZXF1aXJlX2F1dGgoKSB4MgAAAAAAAAtqb2ludF9wdW5jaAAAAAADAAAAAAAAAAV1c2VyMQAAAAAAABMAAAAAAAAABXVzZXIyAAAAAAAAEwAAAAAAAAAGdGFyZ2V0AAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAACFSZXNldCBnbG9iYWwgY291bnRlciAoYWRtaW4gb25seSkAAAAAAAAMcmVzZXRfZ2xvYmFsAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAGNNYW51YWxseSBleHRlbmQgVFRMIGZvciB5b3VyIGJhbGFuY2UgYW5kIHN0YXRzCkRlbW9uc3RyYXRlczogTWFudWFsIFRUTCBleHRlbnNpb24gdG8gcHJldmVudCBleHBpcnkAAAAADWV4dGVuZF9teV90dGwAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAABxDaGVjayBpZiB1c2VyIGlzIG9uIGNvb2xkb3duAAAADmlzX29uX2Nvb2xkb3duAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAH5UUkFOU0ZFUiBQT0lOVFMgLSBUcmFuc2ZlciB0b2tlbnMgYmV0d2VlbiB0d28gdXNlcnMKRGVtb25zdHJhdGVzOiBCb3RoIHNlbmRlciBhbmQgcmVjZWl2ZXIgbXVzdCBhdXRob3JpemUgKFNFUC0wMDQxIGNvbXBsaWFudCkAAAAAAA90cmFuc2Zlcl9wb2ludHMAAAAAAwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAACdHZXQgZ2xvYmFsIGNvdW50ZXIgKHN1bSBvZiBhbGwgYWN0aW9ucykAAAAAEGdldF9nbG9iYWxfY291bnQAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAACFHZXQgdG90YWwgdG9rZW4gc3VwcGx5IChTRVAtMDA0MSkAAAAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACw==",
        "AAAAAAAAABhHZXQgdXNlcidzIGJhdHRsZSByZWNvcmQAAAARZ2V0X2JhdHRsZV9yZWNvcmQAAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAPoAAAH0AAAAAxCYXR0bGVSZWNvcmQ=",
        "AAAAAAAAACFHZXQgc2Vjb25kcyByZW1haW5pbmcgb24gY29vbGRvd24AAAAAAAASY29vbGRvd25fcmVtYWluaW5nAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAG",
        "AAAAAAAAACJHZXQgY3VycmVudCBjb29sZG93biBjb25maWd1cmF0aW9uAAAAAAAVZ2V0X2Nvb2xkb3duX2R1cmF0aW9uAAAAAAAAAAAAAAEAAAAG",
        "AAAAAAAAAC1TZXQgY29vbGRvd24gZHVyYXRpb24gaW4gc2Vjb25kcyAoYWRtaW4gb25seSkAAAAAAAAVc2V0X2Nvb2xkb3duX2R1cmF0aW9uAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAdzZWNvbmRzAAAAAAYAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    burn: this.txFromJSON<null>,
        kick: this.txFromJSON<i128>,
        name: this.txFromJSON<string>,
        punch: this.txFromJSON<i128>,
        battle: this.txFromJSON<boolean>,
        symbol: this.txFromJSON<string>,
        approve: this.txFromJSON<null>,
        balance: this.txFromJSON<i128>,
        decimals: this.txFromJSON<u32>,
        transfer: this.txFromJSON<null>,
        allowance: this.txFromJSON<i128>,
        burn_from: this.txFromJSON<null>,
        get_count: this.txFromJSON<i128>,
        get_stats: this.txFromJSON<Option<UserStats>>,
        heavy_kick: this.txFromJSON<i128>,
        initialize: this.txFromJSON<null>,
        joint_punch: this.txFromJSON<i128>,
        reset_global: this.txFromJSON<null>,
        extend_my_ttl: this.txFromJSON<null>,
        transfer_from: this.txFromJSON<null>,
        is_on_cooldown: this.txFromJSON<boolean>,
        transfer_points: this.txFromJSON<null>,
        get_global_count: this.txFromJSON<u32>,
        get_total_supply: this.txFromJSON<i128>,
        get_battle_record: this.txFromJSON<Option<BattleRecord>>,
        cooldown_remaining: this.txFromJSON<u64>,
        get_cooldown_duration: this.txFromJSON<u64>,
        set_cooldown_duration: this.txFromJSON<null>
  }
}
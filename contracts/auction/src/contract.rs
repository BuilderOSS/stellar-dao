use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, contracttrait, panic_with_error, Address, Env, IntoVal, Symbol,
};
use stellar_access::ownable::{self, Ownable};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_macros::{only_owner, when_not_paused, when_paused};

use crate::{
    error::AuctionError,
    events::{
        emit_auction_cancelled, emit_auction_created, emit_auction_settled, emit_bid_placed,
        emit_bid_refunded, emit_duration_updated, emit_min_bid_increment_updated,
        emit_payment_token_updated, emit_reserve_price_updated, emit_time_buffer_updated,
        emit_treasury_updated,
    },
    storage::{
        get_auction, get_config, is_launched, set_auction, set_config, set_launched,
        AuctionConfig, AuctionState, PaymentType, MAX_AUCTION_EXTENSIONS,
    },
};

#[contract]
pub struct AuctionContract;

#[contracttrait]
pub trait AuctionContractTrait {
    /// Initialize the auction contract
    fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury: Address,
        duration: u64,
        reserve_price: i128,
        min_bid_increment_percent: u32,
        time_buffer: u64,
        payment_token: Option<Address>,
    );

    /// Create a bid with SAC token
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128);

    /// Settle current auction and create new one
    fn settle_and_create_new(e: &Env);

    /// Settle the current auction (when paused)
    fn settle_auction(e: &Env);

    /// Get current auction state
    fn get_auction(e: &Env) -> AuctionState;

    /// Get auction configuration
    fn get_config(e: &Env) -> AuctionConfig;

    /// Cancel current auction (owner only, when paused)
    fn cancel_auction(e: &Env);

    // Configuration setters (owner only, when paused)
    fn set_duration(e: &Env, duration: u64);
    fn set_reserve_price(e: &Env, reserve_price: i128);
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32);
    fn set_time_buffer(e: &Env, time_buffer: u64);
    fn set_payment_token(e: &Env, payment_token: Option<Address>);
    fn set_treasury(e: &Env, treasury: Address);
}

#[contractimpl(contracttrait)]
impl Pausable for AuctionContract {
    fn pause(e: &Env, caller: Address) {
        caller.require_auth();
        let owner = ownable::get_owner(e).unwrap();
        if caller != owner {
            panic_with_error!(e, AuctionError::Unauthorized);
        }
        pausable::pause(e);
    }

    fn unpause(e: &Env, caller: Address) {
        caller.require_auth();
        let owner = ownable::get_owner(e).unwrap();
        if caller != owner {
            panic_with_error!(e, AuctionError::Unauthorized);
        }
        pausable::unpause(e);

        // If first auction, launch
        if !is_launched(e) {
            set_launched(e, true);

            // Create first auction
            Self::create_auction(e);
        } else {
            // If resuming and previous auction was settled, create new one
            let auction = get_auction(e);
            if auction.settled {
                Self::create_auction(e);
            }
        }
    }
}

#[contractimpl(contracttrait)]
impl Ownable for AuctionContract {}

#[contractimpl]
impl AuctionContractTrait for AuctionContract {
    fn __constructor(
        e: &Env,
        owner: Address,
        token_contract: Address,
        treasury: Address,
        duration: u64,
        reserve_price: i128,
        min_bid_increment_percent: u32,
        time_buffer: u64,
        payment_token: Option<Address>,
    ) {
        // Validate config
        if duration == 0 || min_bid_increment_percent == 0 {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        // SECURITY: Enforce payment token is set (SAC-only, no native XLM)
        // This prevents incomplete native payment code paths from being reached
        if payment_token.is_none() {
            panic_with_error!(e, AuctionError::NoPaymentTokenSet);
        }

        // SECURITY: Validate reserve price is reasonable (prevent 1-stroop auctions)
        // Minimum 1000 stroops = 0.0001 units of token
        if reserve_price < 1000 {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        // Validate min increment is reasonable (1-100%)
        if min_bid_increment_percent > 100 {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        // Set owner
        ownable::set_owner(e, &owner);

        // Start paused
        pausable::pause(e);

        // Store config
        let config = AuctionConfig {
            token_contract,
            treasury,
            duration,
            reserve_price,
            min_bid_increment_percent,
            time_buffer,
            payment_token,
        };
        set_config(e, &config);

        // Not launched yet
        set_launched(e, false);
    }

    #[when_not_paused]
    fn create_bid(e: &Env, bidder: Address, token_id: u128, amount: i128) {
        bidder.require_auth();

        let mut auction = get_auction(e);
        let config = get_config(e);

        // Ensure payment token is configured
        let payment_token = config
            .payment_token
            .as_ref()
            .ok_or(AuctionError::NoPaymentTokenSet)
            .unwrap();

        // Validate token ID
        if auction.token_id != token_id {
            panic_with_error!(e, AuctionError::InvalidTokenId);
        }

        // Check auction not ended
        let now = e.ledger().timestamp();
        if now >= auction.end_time {
            panic_with_error!(e, AuctionError::AuctionOver);
        }

        // Transfer payment tokens from bidder to contract
        // Bidder authorizes this via bidder.require_auth() at function entry
        let transfer_symbol = Symbol::new(e, "transfer");
        let transfer_args = soroban_sdk::vec![
            e,
            bidder.to_val(),
            e.current_contract_address().to_val(),
            amount.into_val(e)
        ];

        e.invoke_contract::<()>(payment_token, &transfer_symbol, transfer_args);

        Self::process_bid(
            e,
            &mut auction,
            &config,
            &bidder,
            amount,
            &PaymentType::SAC(payment_token.clone()),
        );
    }

    /// DESIGN NOTE: settle_and_create_new is intentionally permissionless.
    /// Anyone can call this after an auction ends to settle it and create the next one.
    /// This is a deliberate design choice to ensure auctions continue automatically.
    /// The only griefing vector is settling at exact end time, which is minimal impact.
    #[when_not_paused]
    fn settle_and_create_new(e: &Env) {
        let auction = get_auction(e);

        // Ensure auction has ended
        let now = e.ledger().timestamp();
        if now < auction.end_time {
            panic_with_error!(e, AuctionError::AuctionActive);
        }

        Self::settle_auction_internal(e);
        Self::create_auction(e);
    }

    #[when_paused]
    fn settle_auction(e: &Env) {
        Self::settle_auction_internal(e);
    }

    fn get_auction(e: &Env) -> AuctionState {
        get_auction(e)
    }

    fn get_config(e: &Env) -> AuctionConfig {
        get_config(e)
    }

    /// Cancel the current auction and refund the highest bidder (owner only, when paused)
    /// This allows the owner to cancel an auction in emergency situations
    #[only_owner]
    #[when_paused]
    fn cancel_auction(e: &Env) {
        let auction = get_auction(e);

        // Cannot cancel already settled auction
        if auction.settled {
            panic_with_error!(e, AuctionError::AuctionSettled);
        }

        // Refund highest bidder if there is one
        if let Some(bidder) = &auction.highest_bidder {
            if auction.highest_bid > 0 {
                Self::refund_bid(e, bidder, auction.highest_bid, &auction.payment_currency);
            }
        }

        // Mark as settled to prevent further bids
        let mut cancelled_auction = auction.clone();
        cancelled_auction.settled = true;
        set_auction(e, &cancelled_auction);

        emit_auction_cancelled(e, auction.token_id, 0); // reason: 0 = owner cancelled
    }

    #[only_owner]
    #[when_paused]
    fn set_duration(e: &Env, duration: u64) {
        if duration == 0 {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let mut config = get_config(e);
        config.duration = duration;
        set_config(e, &config);

        emit_duration_updated(e, duration);
    }

    #[only_owner]
    #[when_paused]
    fn set_reserve_price(e: &Env, reserve_price: i128) {
        // SECURITY: Validate reserve price is reasonable
        if reserve_price < 1000 {
            panic_with_error!(e, AuctionError::InvalidBid);
        }

        let mut config = get_config(e);
        config.reserve_price = reserve_price;
        set_config(e, &config);

        emit_reserve_price_updated(e, reserve_price);
    }

    #[only_owner]
    #[when_paused]
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32) {
        if min_bid_increment_percent == 0 || min_bid_increment_percent > 100 {
            panic_with_error!(e, AuctionError::InvalidConfig);
        }

        let mut config = get_config(e);
        config.min_bid_increment_percent = min_bid_increment_percent;
        set_config(e, &config);

        emit_min_bid_increment_updated(e, min_bid_increment_percent);
    }

    #[only_owner]
    #[when_paused]
    fn set_time_buffer(e: &Env, time_buffer: u64) {
        let mut config = get_config(e);
        config.time_buffer = time_buffer;
        set_config(e, &config);

        emit_time_buffer_updated(e, time_buffer);
    }

    #[only_owner]
    #[when_paused]
    fn set_payment_token(e: &Env, payment_token: Option<Address>) {
        // SECURITY: Require payment token to be set (matching constructor behavior)
        // This prevents configuration errors that would break bidding functionality
        if payment_token.is_none() {
            panic_with_error!(e, AuctionError::NoPaymentTokenSet);
        }

        let mut config = get_config(e);
        config.payment_token = payment_token.clone();
        set_config(e, &config);

        emit_payment_token_updated(e, &payment_token);
    }

    #[only_owner]
    #[when_paused]
    fn set_treasury(e: &Env, treasury: Address) {
        let mut config = get_config(e);
        config.treasury = treasury.clone();
        set_config(e, &config);

        emit_treasury_updated(e, &treasury);
    }
}

// Internal implementation
impl AuctionContract {
    fn create_auction(e: &Env) {
        let config = get_config(e);

        // Mint new token - authorize auction contract to call mint
        let mint_symbol = Symbol::new(e, "mint");
        let auction_address = e.current_contract_address();
        let mint_args = soroban_sdk::vec![e, auction_address.to_val(), auction_address.to_val()];

        // Authorize auction contract to call token.mint()
        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.token_contract.clone(),
                    fn_name: mint_symbol.clone(),
                    args: mint_args.clone(),
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);

        // SECURITY: Call the mint function - it returns the token ID as u32
        // u32 always fits in u128, so this conversion is safe
        let token_id_u32: u32 = e.invoke_contract(&config.token_contract, &mint_symbol, mint_args);
        let token_id: u128 = token_id_u32 as u128;

        let now = e.ledger().timestamp();

        // SECURITY: Use checked arithmetic for duration calculation
        let end_time = now
            .checked_add(config.duration)
            .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

        let auction = AuctionState {
            token_id,
            highest_bid: 0,
            highest_bidder: None,
            start_time: now,
            end_time,
            settled: false,
            // SECURITY: Will be locked to SAC token on first bid
            payment_currency: PaymentType::Native, // Placeholder only
            extension_count: 0,
        };

        set_auction(e, &auction);
        emit_auction_created(e, token_id, now, end_time);
    }

    fn process_bid(
        e: &Env,
        auction: &mut AuctionState,
        config: &AuctionConfig,
        bidder: &Address,
        amount: i128,
        payment_type: &PaymentType,
    ) {
        let last_bidder = auction.highest_bidder.clone();
        let last_bid = auction.highest_bid;

        // Validate bid amount
        if last_bidder.is_none() {
            // SECURITY: First bid - check reserve price and lock payment currency
            if amount < config.reserve_price {
                panic_with_error!(e, AuctionError::ReservePriceNotMet);
            }

            // SECURITY: Lock payment currency on first bid to prevent switching
            auction.payment_currency = payment_type.clone();
        } else {
            // SECURITY: Subsequent bid - verify payment type matches locked currency
            if &auction.payment_currency != payment_type {
                panic_with_error!(e, AuctionError::InconsistentPaymentType);
            }

            // SECURITY: Check minimum increment with overflow protection
            // Calculate: min_bid = last_bid + (last_bid * percent / 100)
            let increment = last_bid
                .checked_mul(config.min_bid_increment_percent as i128)
                .and_then(|v| v.checked_div(100))
                .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

            let min_bid = last_bid
                .checked_add(increment)
                .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

            if amount < min_bid {
                panic_with_error!(e, AuctionError::MinBidNotMet);
            }
        }

        // Update auction state BEFORE refund (CEI pattern)
        auction.highest_bid = amount;
        auction.highest_bidder = Some(bidder.clone());

        // SECURITY: Check if we need to extend, with max extension limit to prevent DoS
        let now = e.ledger().timestamp();
        let remaining = auction.end_time.saturating_sub(now);
        let extended = remaining < config.time_buffer;

        if extended {
            // SECURITY: Enforce maximum extensions to prevent auction extension DoS
            if auction.extension_count >= MAX_AUCTION_EXTENSIONS {
                panic_with_error!(e, AuctionError::MaxExtensionsExceeded);
            }

            // SECURITY: Use checked arithmetic for time extension
            auction.end_time = now
                .checked_add(config.time_buffer)
                .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

            auction.extension_count += 1;
        }

        // Save state
        set_auction(e, auction);

        // Refund previous bidder AFTER state update (CEI pattern)
        if let Some(prev_bidder) = last_bidder {
            Self::refund_bid(e, &prev_bidder, last_bid, &auction.payment_currency);
        }

        emit_bid_placed(
            e,
            auction.token_id,
            bidder,
            amount,
            payment_type,
            extended,
            auction.end_time,
        );
    }

    fn settle_auction_internal(e: &Env) {
        let mut auction = get_auction(e);

        // Ensure not already settled
        if auction.settled {
            panic_with_error!(e, AuctionError::AuctionSettled);
        }

        // Ensure auction has started
        if auction.start_time == 0 {
            panic_with_error!(e, AuctionError::AuctionNotStarted);
        }

        // Mark as settled BEFORE transfers (CEI pattern)
        auction.settled = true;
        set_auction(e, &auction);

        let config = get_config(e);

        if let Some(winner) = &auction.highest_bidder {
            // Transfer NFT token to winner - authorize the transfer
            let transfer_symbol = Symbol::new(e, "transfer");
            let nft_transfer_args = soroban_sdk::vec![
                e,
                e.current_contract_address().to_val(),
                winner.to_val(),
                (auction.token_id as u32).into_val(e)
            ];

            e.authorize_as_current_contract(soroban_sdk::vec![
                e,
                InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: config.token_contract.clone(),
                        fn_name: transfer_symbol.clone(),
                        args: nft_transfer_args.clone(),
                    },
                    sub_invocations: soroban_sdk::vec![e],
                }),
            ]);

            e.invoke_contract::<()>(&config.token_contract, &transfer_symbol, nft_transfer_args);

            // Transfer proceeds to treasury
            if auction.highest_bid > 0 {
                // SECURITY: Native XLM payment removed - only SAC tokens supported
                // This ensures we never hit incomplete payment code paths
                match &auction.payment_currency {
                    PaymentType::Native => {
                        // Should never reach here due to constructor validation
                        panic_with_error!(e, AuctionError::NoPaymentTokenSet);
                    }
                    PaymentType::SAC(token_addr) => {
                        let payment_transfer_args = soroban_sdk::vec![
                            e,
                            e.current_contract_address().to_val(),
                            config.treasury.to_val(),
                            auction.highest_bid.into_val(e)
                        ];

                        e.authorize_as_current_contract(soroban_sdk::vec![
                            e,
                            InvokerContractAuthEntry::Contract(SubContractInvocation {
                                context: ContractContext {
                                    contract: token_addr.clone(),
                                    fn_name: transfer_symbol.clone(),
                                    args: payment_transfer_args.clone(),
                                },
                                sub_invocations: soroban_sdk::vec![e],
                            }),
                        ]);

                        e.invoke_contract::<()>(
                            token_addr,
                            &transfer_symbol,
                            payment_transfer_args,
                        );
                    }
                }
            }

            emit_auction_settled(
                e,
                auction.token_id,
                &Some(winner.clone()),
                auction.highest_bid,
                &auction.payment_currency,
            );
        } else {
            // No bids - transfer token to treasury for DAO governance use
            // The treasury can use these tokens for voting, redistribution via proposals, or hold them
            let transfer_symbol = Symbol::new(e, "transfer");
            let nft_transfer_args = soroban_sdk::vec![
                e,
                e.current_contract_address().to_val(),
                config.treasury.to_val(),
                (auction.token_id as u32).into_val(e)
            ];

            e.authorize_as_current_contract(soroban_sdk::vec![
                e,
                InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: config.token_contract.clone(),
                        fn_name: transfer_symbol.clone(),
                        args: nft_transfer_args.clone(),
                    },
                    sub_invocations: soroban_sdk::vec![e],
                }),
            ]);

            e.invoke_contract::<()>(&config.token_contract, &transfer_symbol, nft_transfer_args);

            emit_auction_settled(e, auction.token_id, &None, 0, &auction.payment_currency);
        }
    }

    fn refund_bid(e: &Env, bidder: &Address, amount: i128, payment_type: &PaymentType) {
        if amount == 0 {
            return;
        }

        // SECURITY: Native XLM payment removed - only SAC tokens supported
        match payment_type {
            PaymentType::Native => {
                // Should never reach here due to constructor validation
                panic_with_error!(e, AuctionError::NoPaymentTokenSet);
            }
            PaymentType::SAC(token_addr) => {
                // Authorize refund transfer
                let transfer_symbol = Symbol::new(e, "transfer");
                let refund_args = soroban_sdk::vec![
                    e,
                    e.current_contract_address().to_val(),
                    bidder.to_val(),
                    amount.into_val(e)
                ];

                e.authorize_as_current_contract(soroban_sdk::vec![
                    e,
                    InvokerContractAuthEntry::Contract(SubContractInvocation {
                        context: ContractContext {
                            contract: token_addr.clone(),
                            fn_name: transfer_symbol.clone(),
                            args: refund_args.clone(),
                        },
                        sub_invocations: soroban_sdk::vec![e],
                    }),
                ]);

                e.invoke_contract::<()>(token_addr, &transfer_symbol, refund_args);

                // IMPROVEMENT: Emit refund event for observability
                emit_bid_refunded(e, bidder, amount, payment_type);
            }
        }
    }
}

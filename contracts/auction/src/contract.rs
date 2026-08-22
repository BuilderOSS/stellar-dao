use soroban_sdk::{
    contract, contractimpl, contracttrait, panic_with_error, token::TokenClient, Address, Env,
    IntoVal, Symbol, Val, Vec,
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
};
use stellar_access::ownable::{self, Ownable};
use stellar_contract_utils::pausable::{self, Pausable};
use stellar_macros::{only_owner, when_not_paused, when_paused};

use crate::{
    error::AuctionError,
    events::{
        emit_auction_created, emit_auction_settled, emit_bid_placed, emit_duration_updated,
        emit_min_bid_increment_updated, emit_payment_token_updated, emit_reserve_price_updated,
        emit_time_buffer_updated, emit_treasury_updated,
    },
    storage::{
        get_auction, get_config, is_launched, set_auction, set_config, set_launched,
        AuctionConfig, AuctionState, PaymentType,
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
        ownable::enforce_owner_auth(e);
        pausable::pause(e);
    }

    fn unpause(e: &Env, caller: Address) {
        caller.require_auth();
        ownable::enforce_owner_auth(e);
        pausable::unpause(e);

        // If first auction, launch
        if !is_launched(e) {
            set_launched(e, true);

            // Transfer ownership to treasury
            let config = get_config(e);
            ownable::transfer_ownership(e, &config.treasury, 0);

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
        let current_ledger = e.ledger().sequence();
        if current_ledger >= auction.end_ledger {
            panic_with_error!(e, AuctionError::AuctionOver);
        }

        // Transfer tokens from bidder to contract
        let token_client = TokenClient::new(e, payment_token);
        token_client.transfer_from(
            &e.current_contract_address(),
            &bidder,
            &e.current_contract_address(),
            &amount,
        );

        Self::process_bid(
            e,
            &mut auction,
            &config,
            &bidder,
            amount,
            &PaymentType::SAC(payment_token.clone()),
        );
    }

    #[when_not_paused]
    fn settle_and_create_new(e: &Env) {
        let auction = get_auction(e);

        // Ensure auction has ended
        let current_ledger = e.ledger().sequence();
        if current_ledger < auction.end_ledger {
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
        let mut config = get_config(e);
        config.reserve_price = reserve_price;
        set_config(e, &config);

        emit_reserve_price_updated(e, reserve_price);
    }

    #[only_owner]
    #[when_paused]
    fn set_min_bid_increment(e: &Env, min_bid_increment_percent: u32) {
        if min_bid_increment_percent == 0 {
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
        let mint_args = soroban_sdk::vec![e, e.current_contract_address().to_val()];

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

        // Call the mint function - it returns the token ID
        let token_id: u128 = e.invoke_contract(&config.token_contract, &mint_symbol, mint_args);

        let current_ledger = e.ledger().sequence();
        let end_ledger = current_ledger + config.duration as u32;

        let auction = AuctionState {
            token_id,
            highest_bid: 0,
            highest_bidder: None,
            start_ledger: current_ledger,
            end_ledger,
            settled: false,
            payment_currency: PaymentType::Native, // Default, will be set by first bid
        };

        set_auction(e, &auction);
        emit_auction_created(e, token_id, current_ledger, end_ledger);
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
            // First bid - check reserve price
            if amount < config.reserve_price {
                panic_with_error!(e, AuctionError::ReservePriceNotMet);
            }
        } else {
            // Subsequent bid - check minimum increment
            let min_bid = last_bid + (last_bid * config.min_bid_increment_percent as i128 / 100);
            if amount < min_bid {
                panic_with_error!(e, AuctionError::MinBidNotMet);
            }
        }

        // Update auction state BEFORE refund (CEI pattern)
        auction.highest_bid = amount;
        auction.highest_bidder = Some(bidder.clone());
        auction.payment_currency = payment_type.clone();

        // Check if we need to extend
        let current_ledger = e.ledger().sequence();
        let remaining = auction.end_ledger - current_ledger;
        let extended = remaining < config.time_buffer as u32;

        if extended {
            auction.end_ledger = current_ledger + config.time_buffer as u32;
        }

        // Save state
        set_auction(e, auction);

        // Refund previous bidder AFTER state update
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
            auction.end_ledger,
        );
    }

    fn settle_auction_internal(e: &Env) {
        let mut auction = get_auction(e);

        // Ensure not already settled
        if auction.settled {
            panic_with_error!(e, AuctionError::AuctionSettled);
        }

        // Ensure auction has started
        if auction.start_ledger == 0 {
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
                (auction.token_id as i128).into_val(e)
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

            e.invoke_contract::<()>(
                &config.token_contract,
                &transfer_symbol,
                nft_transfer_args,
            );

            // Transfer proceeds to treasury
            if auction.highest_bid > 0 {
                match &auction.payment_currency {
                    PaymentType::Native => {
                        // For native, this would require different handling
                        // For MVP we'll focus on SAC tokens
                        panic_with_error!(e, AuctionError::TransferFailed);
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

                        e.invoke_contract::<()>(token_addr, &transfer_symbol, payment_transfer_args);
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
            // No bids - burn the token - authorize the burn
            let burn_symbol = Symbol::new(e, "burn");
            let burn_args = soroban_sdk::vec![
                e,
                e.current_contract_address().to_val(),
                (auction.token_id as i128).into_val(e)
            ];

            e.authorize_as_current_contract(soroban_sdk::vec![
                e,
                InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: config.token_contract.clone(),
                        fn_name: burn_symbol.clone(),
                        args: burn_args.clone(),
                    },
                    sub_invocations: soroban_sdk::vec![e],
                }),
            ]);

            e.invoke_contract::<()>(&config.token_contract, &burn_symbol, burn_args);

            emit_auction_settled(e, auction.token_id, &None, 0, &auction.payment_currency);
        }
    }

    fn refund_bid(e: &Env, bidder: &Address, amount: i128, payment_type: &PaymentType) {
        if amount == 0 {
            return;
        }

        match payment_type {
            PaymentType::Native => {
                // Native transfers would be handled differently
                // For MVP focusing on SAC tokens
                panic_with_error!(e, AuctionError::TransferFailed);
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
            }
        }
    }
}

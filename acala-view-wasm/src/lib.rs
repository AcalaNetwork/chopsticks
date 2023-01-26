#![cfg_attr(not(feature = "std"), no_std)]
// `construct_runtime!` does a lot of recursion and requires us to increase the limit to 256.
#![recursion_limit = "256"]

// Make the WASM binary available.
#[cfg(feature = "std")]
include!(concat!(env!("OUT_DIR"), "/wasm_binary.rs"));

use sp_api::{impl_runtime_apis, decl_runtime_apis};
use sp_version::RuntimeVersion;
use sp_runtime::traits::Block as BlockT;
use sp_std::prelude::*;
use acala_runtime::{Block, Executive, VERSION as ACALA_VERSION, AccountId, Balance, Balances};

pub mod view {
    use super::*;

    decl_runtime_apis!(
        pub trait AcalaViewApi {
			fn balance(acc: AccountId) -> Balance;
            fn pho() -> u64;
        }
    );
}

pub struct MockRuntime;

impl_runtime_apis! {
	impl sp_api::Core<Block> for MockRuntime {
		fn version() -> RuntimeVersion {
			ACALA_VERSION
		}

		fn execute_block(block: Block) {
			Executive::execute_block(block);
		}

		fn initialize_block(header: &<Block as BlockT>::Header) {
			Executive::initialize_block(header)
		}
	}

    impl view::AcalaViewApi<Block> for MockRuntime {
		fn balance(acc: AccountId) -> Balance {
			Balances::free_balance(&acc) / 1e12 as Balance
		}

        fn pho() -> u64 {
            1
        }
    }
}

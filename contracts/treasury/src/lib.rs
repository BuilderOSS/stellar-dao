#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;

#[cfg(test)]
mod test;

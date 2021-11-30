//! Macros that help with defining the contract's API.
//!
//! ## `message!` and `messages!`
//!
//! The `message!` and `messages!` macros depend on derive macros from serde and schemars.
//! This complicates the reexport via fadroma core due to how procedural macros resolve crates
//! (see https://github.com/serde-rs/serde/issues/1465#issuecomment-458420543)
//!
//! The workaround at https://github.com/serde-rs/serde/issues/1465#issuecomment-800686252
//! is automatically implemented in the `mod msg` generated by the `contract!` macro
//! This is done automatically in the `mod msg` defined by the `contract!` macro. However if
//! you use the message macros manually, it is up to you to implement a corresponding workaround.
//!
//! ## `define_*_message(s)`
//!
//! These macros are called internally by the `contract!` macro
//! and get passed the necessary values from the corresponding `contract!` sections
//! (which define API and implementation in the same place) to define just the API.
//!
//! Alternatively if you have your message definitions in a separate module,
//! (e.g. if you have a separate API crate defining the interface for multiple contracts),
//! these macros allow for `contract!` to just import and use the external message structs/enums.

/// Define a struct that implements the necessary traits to be used as message.
/// (de/serialization, schema generation, cloning, debug printing, equality comparison)
#[macro_export] macro_rules! message {
    ($Msg:ident $body:tt) => {
        #[derive(Clone,Debug,PartialEq,serde::Serialize,serde::Deserialize,schemars::JsonSchema)]
        #[serde(rename_all="snake_case")]
        pub struct $Msg $body
    }
}

/// Define an enum that implements the necessary traits to be used as message.
/// (de/serialization, schema generation, cloning, debug printing, equality comparison)
#[macro_export] macro_rules! messages {
    ( $( $Enum:ident { $( $(#[$meta:meta])* $Msg:ident $($body:tt)? )* } )* ) => { $(
        #[derive(Clone,Debug,PartialEq,serde::Serialize,serde::Deserialize,schemars::JsonSchema)]
        #[serde(rename_all="snake_case")]
        pub enum $Enum { $(
            $(#[$meta])* $Msg $($body)?
        ),* } )*
    }
}

/// Define instantiation API. Normally called by `contract!` within the auto-generated `mod msg`.
#[macro_export] macro_rules! define_init_message {

    // if imported:
    ($_:ident, $Import:ident) => { pub use super::$Import; };

    // if defined in place:
    ($Name:ident, { $(
        $(#[$meta:meta])* $arg:ident : $type:ty
    ),* }) => {
        message!($Name { $($arg: $type),* });
    }

}

/// Define query API. Normally called by `contract!` within the auto-generated `mod msg`.
#[macro_export] macro_rules! define_q_messages {

    // if imported:
    ($_1:tt, $Import:ident, { $($_2:tt)* }) => { pub use super::$Import; };

    // if defined in place:
    ($Name:ident, { $(
        $(#[$meta:meta])* $Variant:ident ( $(
            $(#[$arg_meta:meta])* $arg:ident : $type:ty
        ),* )
    )* }) => {
        messages!($Name { $( $(#[$meta])* $Variant {$(
            $(#[$arg_meta])* $arg: $type
        ),*} )* });
    };

}

/// Define transaction API. Normally called by `contract!` within the auto-generated `mod msg`.
#[macro_export] macro_rules! define_tx_messages {

    // if imported:
    ($_1:tt, $Import:ident, { $($_2:tt)* }) => { pub use super::$Import; };

    // if defined in place:
    ($Name:ident, { $(
        $(#[$meta:meta])* $Variant:ident ( $(
            $(#[$arg_meta:meta])* $arg:ident : $type:ty
        ),* )
    )* }) => {
        messages!($Name { $( $(#[$meta])* $Variant {$(
            $(#[$arg_meta])* $arg: $type
        ),*} )* });
    };

}
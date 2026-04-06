/**
 * Ground-truth constants for Stacks mempool and relay nonce management.
 *
 * Sources cited from stacks-core and relay production configuration.
 */

/** stacks-core MAXIMUM_MEMPOOL_TX_CHAINING (mempool.rs:73) */
export const STACKS_NODE_CHAINING_LIMIT = 25;

/** Relay operational limit — 5-slot buffer below node limit */
export const RELAY_CHAINING_LIMIT = 20;

/** Nakamoto mempool GC window: 256 * 10 * 60 = 153,600 seconds (~42.7 hours) */
export const MEMPOOL_TX_MAX_AGE_SECONDS = 153600;

/** Pre-Nakamoto mempool GC window in blocks */
export const MEMPOOL_TX_MAX_AGE_BLOCKS = 256;

/** Sender hand entry TTL: 15 minutes */
export const SENDER_HAND_EXPIRY_MS = 900000;

/** stacks-core DEFAULT_BLACKLIST_TIMEOUT: 48 hours (mempool.rs:91) */
export const BLACKLIST_TIMEOUT_SECONDS = 172800;

/** Maximum RBF attempts per occupied nonce before abandoning */
export const MAX_RBF_ATTEMPTS = 3;

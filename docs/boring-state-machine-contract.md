# Boring State Machine Contract: Phase 1 Packet

This document is the phase 1 coordination packet for the `2026-04-09-boring-payment-state-machine` quest.

It freezes the canonical contract that downstream repos should consume before relay and service migrations continue.

Companion document:

- see `docs/workers-baseline.md` for the default Cloudflare Worker transport split, repo baseline, observability policy, and product-convention expectations that should accompany this contract

## Canonical Caller-Facing States

The shared public state machine is:

`requires_payment -> queued -> broadcasting -> mempool -> confirmed | failed | replaced | not_found`

Notes:

- `submitted` is allowed only as an internal relay observability step.
- RPC and HTTP adapters must collapse any internal `submitted` step into `queued` before returning caller-facing data.
- `confirmed` is the only default deliverable state.

## Identity and Duplicate Handling

- `paymentId` is relay-owned.
- `payment-identifier` is a client-supplied idempotency input only. It is not a public polling identity and must never be surfaced or reconstructed as canonical `paymentId`.
- Duplicate submission of the same already-known payment artifact should reuse the same `paymentId` until that payment reaches a terminal state.
- Accepted duplicate submit responses should return the current caller-facing in-flight status for that reused `paymentId`: `queued`, `broadcasting`, or `mempool` as applicable.
- Internal and external polling should both treat `paymentId` as the stable handle for in-flight and terminal lookup.
- `checkStatusUrl` is an additive canonical poll hint for the same relay-owned lifecycle.
- If a consumer has neither relay `paymentId` nor canonical `checkStatusUrl`, it must fail closed rather than inventing a polling identity.

## Required Relay Lifecycle Bridge

The relay implementation has to keep one canonical `paymentId` attached across this bridge:

The row order below is normative. It is the frozen transition sequence for the relay lifecycle bridge, not a display-only convention.

| Relay step | Caller-facing state projection | Contract |
| --- | --- | --- |
| sender-hand accepted | `queued` | relay accepted sender-hand ownership for this `paymentId` |
| queued for sponsor dispatch | `queued` | the same `paymentId` is now queued under sponsor dispatch ownership |
| sponsor broadcasted | `broadcasting`, then `mempool` when observed | chain visibility changes, but the canonical identity does not |
| confirmed | `confirmed` | canonical delivery success |
| replaced | `replaced` | old `paymentId` is terminal because another tx won the nonce |
| terminal failed | `failed` | old `paymentId` is terminal failed with a normalized `terminalReason` |

## Terminal Outcome Contract

Polling and status responses should expose:

- canonical `status`
- relay-owned `paymentId`
- `checkStatusUrl` when the transport knows the canonical poll endpoint
- normalized `terminalReason` when the outcome is terminal and known
- transport-local `errorCode` only as an adapter detail, not as the semantic source of truth

Normalized terminal reasons let `landing-page`, `agent-news`, `x402-api`, `skills`, and `aibtc-mcp-server` stop inventing their own retry buckets from raw relay error strings.

## Recovery Boundary

Sender-owned responsibilities:

- sender nonce correctness
- rebuild after sender nonce stale or gap
- sender-wallet recovery actions

Relay-owned responsibilities:

- payment identity lifecycle
- sponsor ordering and sponsor nonce recovery
- in-flight payment transitions
- terminal settlement truth

## Terminal Reason Handling Guidance

| Terminal reason category | Recovery owner | Expected client action |
| --- | --- | --- |
| `validation` | sender | stop and fix the request or signed transaction |
| `sender` | sender | rebuild and re-sign a new payment |
| `relay` | relay | use bounded retry on the same `paymentId` only when the adapter marks it retryable |
| `settlement` | relay | treat broadcast or settlement failures as relay-owned recovery on the same `paymentId` unless sender repair is explicitly required |
| `replacement` | caller | stop polling the old `paymentId`; decide the next action explicitly |
| `identity` | caller | the old identity is gone; restart the higher-level flow with a new payment and never invent a replacement `paymentId` |

## Compatibility Notes

- `RpcSubmitPaymentAccepted.status` should return canonical caller-facing in-flight states: `queued` for fresh acceptance, and `queued`, `broadcasting`, or `mempool` when duplicate reuse surfaces the active state of the reused `paymentId`.
- `queued_with_warning` remains allowed only as a temporary compatibility shim while warning-aware callers migrate.
- `RpcCheckPaymentResult.status` and `HttpPaymentStatusResponse.status` must never return `submitted`.
- `RpcCheckPaymentResult` and `HttpPaymentStatusResponse` may both surface `checkStatusUrl` as an additive canonical poll hint.
- `terminalReason` is additive and should be emitted wherever relay adapters already know the normalized terminal classification.

## Migration Order

1. `tx-schemas`: freeze the public contract and publish additive fields.
2. `x402-sponsor-relay`: collapse caller-facing `submitted` into `queued`, emit normalized `terminalReason`, and preserve duplicate reuse by `paymentId`.
3. `landing-page`, `agent-news`, `x402-api`: consume shared RPC/HTTP schemas and delete copied contract types.
4. `skills`, `aibtc-mcp-server`: converge on one external client retry and recovery matrix driven by shared statuses and terminal reasons.

## Scenario Matrix

| Scenario | Canonical status | terminalReason | Service delivery default | Client action |
| --- | --- | --- | --- | --- |
| Fresh submission accepted | `queued` | | wait or poll by `paymentId` | no rebuild |
| Duplicate same submission | `queued`, `broadcasting`, or `mempool` | | do not create a second receipt | reuse same `paymentId` / same tx |
| Relay broadcasting | `broadcasting` | | do not deliver by default | poll |
| Seen in mempool | `mempool` | | do not deliver by default unless route exception is documented | poll |
| Confirmed on-chain | `confirmed` | | deliver | success |
| Sender nonce stale | `failed` | `sender_nonce_stale` | do not deliver | rebuild transaction |
| Sender nonce gap | `failed` | `sender_nonce_gap` | do not deliver | rebuild or submit missing nonce |
| Invalid transaction | `failed` | `invalid_transaction` | do not deliver | stop |
| Sponsor/relay internal failure | `failed` | `queue_unavailable`, `sponsor_failure`, or `internal_error` | do not deliver | bounded retry only if adapter marks retryable |
| Broadcast failure | `failed` | `broadcast_failure` or `chain_abort` | do not deliver | treat as failed; rebuild only if caller owns sender recovery |
| Nonce replacement | `replaced` | `nonce_replacement` or `superseded` | do not deliver | stop polling old `paymentId`; decide next client action explicitly |
| Missing or expired identity | `not_found` | `expired` or `unknown_payment_identity` | do not deliver | old identity is gone; restart the higher-level flow with a new payment and never retry the old `paymentId` |

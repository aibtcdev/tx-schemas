# Boring State Machine Contract: Phase 1 Packet

This document is the phase 1 coordination packet for the `2026-04-01-boring-tx-state-machine` quest.

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
- Duplicate submission of the same already-known payment artifact should reuse the same `paymentId` until that payment reaches a terminal state.
- Internal and external polling should both treat `paymentId` as the stable handle for in-flight and terminal lookup.

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

## Compatibility Notes

- `RpcSubmitPaymentAccepted.status` should return `queued` for normal acceptance and `queued_with_warning` only as a temporary compatibility shim while warning-aware callers migrate.
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
| Duplicate same submission | `queued` or later existing status | | do not create a second receipt | reuse same `paymentId` / same tx |
| Relay broadcasting | `broadcasting` | | do not deliver by default | poll |
| Seen in mempool | `mempool` | | do not deliver by default unless route exception is documented | poll |
| Confirmed on-chain | `confirmed` | | deliver | success |
| Sender nonce stale | `failed` | `sender_nonce_stale` | do not deliver | rebuild transaction |
| Sender nonce gap | `failed` | `sender_nonce_gap` | do not deliver | rebuild or submit missing nonce |
| Invalid transaction | `failed` | `invalid_transaction` | do not deliver | stop |
| Sponsor/relay internal failure | `failed` | `queue_unavailable`, `sponsor_failure`, or `internal_error` | do not deliver | bounded retry only if adapter marks retryable |
| Broadcast failure | `failed` | `broadcast_failure` or `chain_abort` | do not deliver | treat as failed; rebuild only if caller owns sender recovery |
| Nonce replacement | `replaced` | `nonce_replacement` or `superseded` | do not deliver | stop polling old `paymentId`; decide next client action explicitly |
| Missing or expired identity | `not_found` | `expired` or `unknown_payment_identity` | do not deliver | stop or restart from a new payment flow |

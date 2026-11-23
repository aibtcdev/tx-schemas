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
- After a terminal state, including `failed`, the old `paymentId` is not reused: a resubmission of the same artifact is a new payment with a new `paymentId`.
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
| `relay` | caller (after `failed`) | only when the adapter marks it retryable: resubmit the *same signed transaction*; the relay returns a new `paymentId`; do not re-sign while the original may still land |
| `settlement` | caller (after `failed`) | if marked retryable, resubmit the *same signed transaction* and follow the new `paymentId`; before any rebuild, check whether the original may still land (see below); exception: `chain_abort` is never resubmitted (rebuild) |
| `replacement` | caller | stop polling the old `paymentId`; decide the next action explicitly |
| `identity` | caller | the old identity is gone; restart the higher-level flow with a new payment and never invent a replacement `paymentId` |

For the `relay` and `settlement` rows, the relay owns recovery only while the payment is in flight. Any relay retries happen before the record turns `failed` and do not change its `paymentId`. Once the relay reports `failed`, that `paymentId` is terminal: the relay does not retry it, and polling it will not change the outcome. Recovery then belongs to the caller, so both rows export `recoveryOwner: "caller"` and `clientAction: "resubmit-same-signed-tx"`. A resubmission of the same transaction is a new payment with a new `paymentId` (see Identity and Duplicate Handling). The bound on these resubmissions belongs to the caller: count resubmissions, not polls of the failed `paymentId`. A resubmission the relay rejects returns no `paymentId`: count it toward the bound and do not poll. If the original submit carried a `payment-identifier`, send a new one (or none) with the resubmission: within its idempotency window the relay answers a repeated `payment-identifier` with the cached original acceptance, which names the failed `paymentId`.

Re-sending the same signed transaction is the nonce-safe choice. The relay accepts only sponsored transactions on this path and sponsors each submission itself, so a resubmission can carry a different sponsor nonce and fee, and therefore a different txid, than the original. Every copy still spends the same sender nonce, so at most one copy can confirm.

"Marked retryable" means the failure carries `retryable: true`. An absent `retryable` counts as not retryable.

Some reasons need a different action than their category. Code that acts on a terminal reason should read `TERMINAL_REASON_HANDLING[reason]`, which is the category default with the exceptions in `TERMINAL_REASON_HANDLING_EXCEPTIONS` applied. The only exception today is `chain_abort`: it stays in the `settlement` category for reporting, but its handling is `recoveryOwner: "sender"`, `clientAction: "rebuild-signed-payment"`. It is never resubmittable, whatever `retryable` says: the transaction was mined and aborted, so its sender nonce is spent and an identical copy can never confirm. Rebuild and re-sign a new payment only if the payment is still wanted.

Check whether the original may still land before any rebuild. A `broadcast_failure` can be recorded even though the transaction reached the mempool. If that original later confirms, the resubmission fails with a `sender`-category reason (`sender_nonce_stale` or `sender_nonce_duplicate`), and a caller that follows the `sender` row would pay twice. So before rebuilding after a `settlement` failure, or after a `sender`-category failure of a resubmission:

- Look the original up by sender address and the sender nonce in the signed transaction. Don't rely on a txid you computed from the bytes you signed: the on-chain txid covers the relay's sponsor signature and fee, and differs between sponsored copies. A txid the relay reported on the failed record identifies only that one copy.
- If a transaction at that sender nonce is pending, do not rebuild. Wait for it to resolve.
- If it confirmed successfully, the payment happened, even though the old `paymentId` still reads `failed`.
- Rebuild only if no copy at that nonce is pending or successfully confirmed, and the caller owns sender recovery.

## Compatibility Notes

- `RpcSubmitPaymentAccepted.status` should return canonical caller-facing in-flight states: `queued` for fresh acceptance, and `queued`, `broadcasting`, or `mempool` when duplicate reuse surfaces the active state of the reused `paymentId`.
- `queued_with_warning` remains allowed only as a temporary compatibility shim while warning-aware callers migrate.
- `RpcCheckPaymentResult.status` and `HttpPaymentStatusResponse.status` must never return `submitted`.
- `RpcCheckPaymentResult` and `HttpPaymentStatusResponse` may both surface `checkStatusUrl` as an additive canonical poll hint.
- `terminalReason` is additive and should be emitted wherever relay adapters already know the normalized terminal classification.
- Breaking: the `relay` and `settlement` categories now export `recoveryOwner: "caller"` and `clientAction: "resubmit-same-signed-tx"`. The old `recoveryOwner: "relay"` / `clientAction: "bounded-retry-same-payment"` read as "the relay retries the same `paymentId`", which it never does after `failed`. The old token is retired, not aliased, so code that branches on it falls through to its default handling instead of waiting on the relay.
- `TERMINAL_REASON_HANDLING` (per reason) is additive. Code that acts on a terminal reason should read it instead of `TERMINAL_REASON_CATEGORY_HANDLING[TERMINAL_REASON_TO_CATEGORY[reason]]`, which misses per-reason exceptions such as `chain_abort`.

## Machine-Readable Contract Exports

Downstream repos should import these constants from `@aibtc/tx-schemas` rather than hardcoding values:

- `CANONICAL_POLLING_IDENTITY_FIELDS` — the only valid fields for polling identity lookup
- `RELAY_LIFECYCLE_BRIDGE` — frozen ordered transition sequence from acceptance to terminality
- `TERMINAL_REASON_CATEGORY_HANDLING` — default recovery owner and expected client action by terminal reason category
- `TERMINAL_REASON_HANDLING` — recovery owner and expected client action by terminal reason (category default plus `TERMINAL_REASON_HANDLING_EXCEPTIONS`); read this one when acting on a specific reason
- `CanonicalDomainBoundary` — domain boundary constants including payment identity, polling identity, and recovery boundaries

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
| Sender nonce gap before canonical acceptance | `failed` | `sender_nonce_gap` | do not deliver | rebuild or submit missing nonce |
| Accepted payment blocked on sender nonce gap | `queued` | | do not deliver | keep polling the same `paymentId`; use hold or wedge diagnostics to decide whether to submit missing nonces or escalate |
| Invalid transaction | `failed` | `invalid_transaction` | do not deliver | stop |
| Sponsor/relay internal failure | `failed` | `queue_unavailable`, `sponsor_failure`, or `internal_error` | do not deliver | only if adapter marks retryable: bounded resubmission of the same signed transaction; if accepted, poll the new `paymentId`; if rejected, there is no `paymentId`: count it toward the bound and do not poll |
| Broadcast failure | `failed` | `broadcast_failure` | do not deliver | treat as failed; if marked retryable, resubmit the same signed transaction under a new `paymentId`; before any rebuild (not retryable, bound reached, or a `sender` failure of the resubmission), check whether the original may still land by sender address + nonce: if pending, wait; if confirmed, the payment happened; rebuild only if neither, and only if the caller owns sender recovery |
| Aborted on chain | `failed` | `chain_abort` | do not deliver | the transaction was mined and its nonce spent: never resubmit it; rebuild and re-sign only if the payment is still wanted (`TERMINAL_REASON_HANDLING.chain_abort`) |
| Nonce replacement | `replaced` | `nonce_replacement` or `superseded` | do not deliver | stop polling old `paymentId`; decide next client action explicitly |
| Missing or expired identity | `not_found` | `expired` or `unknown_payment_identity` | do not deliver | old identity is gone; restart the higher-level flow with a new payment and never retry the old `paymentId` |

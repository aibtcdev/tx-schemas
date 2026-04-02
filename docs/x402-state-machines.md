# x402 and Sponsored Transaction State Machines

Related review document:

- `x402-approval-spec.md` defines the target approval bar, transport boundaries, and reduction-first architecture expectations for this flow.

These diagrams reflect the implemented flow across:

- `aibtcdev/skills`
- `aibtcdev/aibtc-mcp-server`
- `aibtcdev/landing-page` (`aibtc.com`)
- `aibtcdev/agent-news` (`aibtc.news`)
- `aibtcdev/x402-sponsor-relay`
- Hiro API

## 1. Client State Machine: `skills` and `aibtc-mcp-server`

This is the client-side control flow used when an x402-protected endpoint returns `402 Payment Required`.

```mermaid
stateDiagram-v2
    [*] --> Requesting

    Requesting --> CompletedFree: 2xx free response
    Requesting --> PaymentRequired: HTTP 402 + payment-required
    Requesting --> Failed: non-402/non-retryable error

    PaymentRequired --> ValidateOffer
    ValidateOffer --> Failed: invalid header or no Stacks option
    ValidateOffer --> EnsureWallet

    EnsureWallet --> Failed: wallet/network/balance problem
    EnsureWallet --> BuildSponsoredTx

    BuildSponsoredTx --> SignPaymentPayload
    SignPaymentPayload --> SubmitPaidRequest

    SubmitPaidRequest --> CompletedPaid: 200/201 + payment-response txid
    SubmitPaidRequest --> CompletedPending: 200/201 + paymentStatus=pending + paymentId
    SubmitPaidRequest --> RetrySameTx: 409 NONCE_CONFLICT or relay-side duplicate
    SubmitPaidRequest --> RebuildTx: 409 SENDER_NONCE_STALE or SENDER_NONCE_GAP
    SubmitPaidRequest --> BackoffRetry: 502/503 or retryable relay error
    SubmitPaidRequest --> RecoveryCheck: retries exhausted with seen relay txids
    SubmitPaidRequest --> Failed: non-retryable failure

    RetrySameTx --> SubmitPaidRequest: reuse cached txHex + paymentId for relay dedup
    RebuildTx --> BuildSponsoredTx: fetch fresh nonce and re-sign
    BackoffRetry --> SubmitPaidRequest

    RecoveryCheck --> AutoRecover: Hiro shows seen txid confirmed
    RecoveryCheck --> Failed: no confirmed txid found
    AutoRecover --> CompletedPaid: resubmit using paymentTxid proof

    CompletedFree --> [*]
    CompletedPaid --> [*]
    CompletedPending --> [*]
    Failed --> [*]
```

Notes:

- `aibtc-mcp-server/src/services/x402.service.ts` does the generic `402 -> sign -> retry once` flow.
- `skills/src/lib/utils/x402-retry.ts` and `aibtc-mcp-server/src/tools/inbox.tools.ts` add inbox-specific nonce recovery, same-tx dedup retries, and txid auto-recovery.

## 2. Service State Machine: `aibtc.com` and `aibtc.news`

This is how the service workers behave after receiving a paid request.

```mermaid
stateDiagram-v2
    [*] --> UnpaidRequest

    UnpaidRequest --> Return402: no payment-signature/payment proof
    Return402 --> [*]

    UnpaidRequest --> VerifyPayment: payment-signature or paymentTxid present

    VerifyPayment --> RpcSubmit: X402_RELAY service binding available
    VerifyPayment --> HttpSettle: fallback HTTP /settle path

    RpcSubmit --> RelayRejected: submitPayment accepted=false
    RpcSubmit --> PollPaymentId: submitPayment accepted=true + paymentId

    PollPaymentId --> DeliverConfirmed: checkPayment=confirmed
    PollPaymentId --> DeliverConfirmed: checkPayment=mempool
    PollPaymentId --> DeliverPending: poll exhausted with queued/broadcasting/mempool
    PollPaymentId --> RelayRejected: checkPayment=failed
    PollPaymentId --> RelayRejected: checkPayment=replaced
    PollPaymentId --> RelayRejected: checkPayment=not_found
    PollPaymentId --> RelayUnavailable: RPC error / circuit breaker

    HttpSettle --> DeliverConfirmed: relay returns confirmed
    HttpSettle --> DeliverPending: relay returns pending
    HttpSettle --> RelayRejected: 4xx settle rejection
    HttpSettle --> RelayUnavailable: 5xx / timeout

    DeliverConfirmed --> StoreResource
    DeliverPending --> StoreResource

    StoreResource --> SuccessResponse
    SuccessResponse --> [*]

    RelayRejected --> ErrorResponse
    RelayUnavailable --> ErrorResponse
    ErrorResponse --> [*]
```

What the service returns:

- `confirmed` or `mempool`: resource is delivered normally.
- `pending`: resource is still delivered, but response includes `paymentStatus: "pending"` and `paymentId`.
- `failed`, `replaced`, `not_found`, or relay unavailability: request fails.

## 3. Relay Queue Payment State Machine: `x402-sponsor-relay` RPC path

This is the async `paymentId` lifecycle behind `submitPayment()` and `checkPayment()`.

```mermaid
stateDiagram-v2
    [*] --> Accepted

    Accepted --> Failed: invalid tx / not sponsored / stale nonce / duplicate nonce
    Accepted --> Queued: paymentId created + KV record written + queue send ok

    Queued --> Broadcasting: queue consumer starts work
    Queued --> Queued: held sender nonce gap
    Queued --> Queued: sponsor contention retry
    Queued --> Failed: queue unavailable / terminal sponsor failure

    Broadcasting --> Queued: nonce conflict or TooMuchChaining retry
    Broadcasting --> Failed: terminal broadcast failure
    Broadcasting --> Mempool: broadcastOnly() returns txid

    Mempool --> Confirmed: chainhook marks success
    Mempool --> Failed: chainhook sees on-chain abort
    Mempool --> Replaced: NonceDO replacement notification
    Mempool --> Mempool: waiting for chainhook/finalization

    Failed --> [*]
    Confirmed --> [*]
    Replaced --> [*]
```

Stored `paymentId` statuses exposed by `checkPayment()`:

- Pending/in-flight: `queued`, `broadcasting`, `mempool`
- Terminal: `confirmed`, `failed`, `replaced`
- Missing/expired: `not_found`

The relay may still track a more detailed internal acceptance/submission step, but caller-facing RPC and HTTP contracts should collapse that into `queued`.

## 4. Direct Relay Settlement State Machine: `/settle` to Hiro final status

This is the synchronous/native settlement flow used by the relay itself when handling direct `/settle` or `/relay` style settlement logic.

```mermaid
stateDiagram-v2
    [*] --> ValidatePayment

    ValidatePayment --> Failed: tx deserialize or payment requirements invalid
    ValidatePayment --> Broadcasting

    Broadcasting --> BroadcastRetry: Hiro/node 5xx or retryable transport failure
    Broadcasting --> Failed: client rejection or terminal broadcast failure
    Broadcasting --> PendingReturn: caller requested broadcast-only mode
    Broadcasting --> PollingHiro: txid accepted

    BroadcastRetry --> Broadcasting
    BroadcastRetry --> Failed: retries exhausted

    PollingHiro --> Confirmed: Hiro tx_status=success + block_height
    PollingHiro --> Failed: Hiro tx_status=abort_*
    PollingHiro --> PollingHiro: tx_status=pending
    PollingHiro --> PollingHiro: tx_status=dropped_* treated as transient
    PollingHiro --> PollingHiro: 404 not yet indexed
    PollingHiro --> PollingHiro: degraded Hiro polling with backoff
    PollingHiro --> PendingReturn: poll budget exhausted

    PendingReturn --> BackgroundStatusTracking
    BackgroundStatusTracking --> Confirmed: later Hiro/chainhook confirmation
    BackgroundStatusTracking --> Failed: later on-chain abort

    Confirmed --> [*]
    Failed --> [*]
```

Important Hiro-specific behavior:

- `success` is only terminal when `block_height` is present.
- `abort_*` is terminal failure.
- `dropped_*` is treated as transient and the relay keeps polling.
- If polling budget expires, relay returns `pending` and status is updated later via KV + background/chainhook updates.

## 5. End-to-End View

```mermaid
stateDiagram-v2
    [*] --> ClientCallsService
    ClientCallsService --> NeedsPayment: service returns 402
    NeedsPayment --> ClientSignsSponsoredTx
    ClientSignsSponsoredTx --> ServiceVerifies

    ServiceVerifies --> RelayQueueFlow: landing-page / agent-news RPC submitPayment
    ServiceVerifies --> RelaySettleFlow: fallback HTTP /settle

    RelayQueueFlow --> HiroObserved
    RelaySettleFlow --> HiroObserved

    HiroObserved --> FinalConfirmed
    HiroObserved --> FinalFailed
    HiroObserved --> ServicePending

    ServicePending --> ClientPollsPaymentId
    ClientPollsPaymentId --> FinalConfirmed
    ClientPollsPaymentId --> FinalFailed
    ClientPollsPaymentId --> ServicePending

    FinalConfirmed --> [*]
    FinalFailed --> [*]
```

## Code Anchors

- Client payment interceptor:
  - `aibtc-mcp-server/src/services/x402.service.ts`
  - `skills/src/lib/services/x402.service.ts`
- Client inbox retry and recovery:
  - `skills/src/lib/utils/x402-retry.ts`
  - `skills/src/lib/utils/x402-recovery.ts`
  - `aibtc-mcp-server/src/tools/inbox.tools.ts`
- Service verification and pending-success behavior:
  - `landing-page/app/api/inbox/[address]/route.ts`
  - `landing-page/app/api/payment-status/[paymentId]/route.ts`
  - `agent-news/src/services/x402.ts`
  - `agent-news/src/routes/payment-status.ts`
- Relay async payment status:
  - `x402-sponsor-relay/src/rpc.ts`
  - `x402-sponsor-relay/src/services/payment-status.ts`
  - `x402-sponsor-relay/src/queue-consumer.ts`
  - `x402-sponsor-relay/src/endpoints/chainhook.ts`
  - `x402-sponsor-relay/src/durable-objects/nonce-do.ts`
- Relay Hiro settlement polling:
  - `x402-sponsor-relay/src/services/settlement.ts`

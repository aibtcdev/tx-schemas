# @aibtc/tx-schemas

Shared zod schemas for AIBTC payment state models, first-party relay RPC schemas,
and external x402 HTTP schemas.

## Install

```bash
npm install @aibtc/tx-schemas zod
```

## Package Shape

- `@aibtc/tx-schemas` exports the full surface
- `@aibtc/tx-schemas/core` exports canonical payment enums, terminal reasons, and shared primitives
- `@aibtc/tx-schemas/rpc` exports internal relay service-binding schemas
- `@aibtc/tx-schemas/http` exports external x402 facilitator and polling schemas
- `@aibtc/tx-schemas/news` exports shared editorial/newsroom schemas, including beat lifecycle transition contracts

## Usage

```ts
import { PaymentStateSchema, PaymentStateCategoryByState } from "@aibtc/tx-schemas/core";
import { RpcSubmitPaymentResultSchema } from "@aibtc/tx-schemas/rpc";
import { HttpSettleRequestSchema } from "@aibtc/tx-schemas/http";
import { TERMINAL_REASONS } from "@aibtc/tx-schemas/terminal-reasons";

const state = PaymentStateSchema.parse("confirmed");
const category = PaymentStateCategoryByState[state];
const terminalReasons = TERMINAL_REASONS;

const rpcResult = RpcSubmitPaymentResultSchema.parse({
  accepted: true,
  paymentId: "pay_01J7QZXK5XRGBVMK3N9RTNF4WW",
  status: "queued",
});

const settleRequest = HttpSettleRequestSchema.parse({
  paymentPayload: {
    x402Version: 2,
    payload: { transaction: "0x1234" },
  },
  paymentRequirements: {
    scheme: "exact",
    network: "stacks:2147483648",
    amount: "1000000",
    asset: "STX",
    payTo: "ST000000000000000000002AMW42H",
  },
});
```

## Subpath Imports

- `@aibtc/tx-schemas`
- `@aibtc/tx-schemas/core`
- `@aibtc/tx-schemas/core/enums`
- `@aibtc/tx-schemas/core/schemas`
- `@aibtc/tx-schemas/core/primitives`
- `@aibtc/tx-schemas/terminal-reasons`
- `@aibtc/tx-schemas/core/terminal-reasons`
- `@aibtc/tx-schemas/rpc`
- `@aibtc/tx-schemas/http`
- `@aibtc/tx-schemas/news`

## Schema Rules

- Canonical payment states live in `core` and are the only shared payment-state source of truth.
- Public canonical states are `requires_payment`, `queued`, `broadcasting`, `mempool`, `confirmed`, `failed`, `replaced`, and `not_found`.
- `submitted` is reserved for relay internals and must not appear in the caller-facing contract.
- `rpc` and `http` may differ in field names and transport ergonomics, but they must reuse the same state semantics.
- The default protected-resource delivery invariant is `deliver-only-on-confirmed`.
- Any product that delivers on in-flight states should document that as an application exception, not a canonical package rule.
- `paymentId` is relay-owned and duplicate submission should reuse the same `paymentId` until terminal resolution.
- `payment-identifier` is client-supplied idempotency input only. It must not be treated as canonical public `paymentId`.
- Accepted duplicate submit responses should return the current caller-facing in-flight status for that `paymentId`: `queued`, `broadcasting`, or `mempool` as applicable.
- `queued_with_warning` remains an RPC-only temporary compatibility shim for warning-aware callers during migration.
- Polling contracts may surface `checkStatusUrl` as an additive convenience field, and internal/external polling should treat it as another way to reach the same `paymentId` lifecycle.
- If a downstream consumer has neither relay `paymentId` nor canonical `checkStatusUrl`, it must fail closed instead of inventing a polling identity.
- Terminal polling responses should carry a normalized `terminalReason` when one is known, even if transports also emit local error codes.
- Machine-readable contract exports for downstream repos include `CanonicalDomainBoundary`, `CANONICAL_POLLING_IDENTITY_FIELDS`, `RELAY_LIFECYCLE_BRIDGE`, and `TERMINAL_REASON_CATEGORY_HANDLING`.

More detail lives in [docs/package-schemas.md](docs/package-schemas.md),
[docs/boring-state-machine-contract.md](docs/boring-state-machine-contract.md),
[docs/x402-approval-spec.md](docs/x402-approval-spec.md), and
[docs/x402-state-machines.md](docs/x402-state-machines.md).

## Consuming sponsor wallet helpers

The `core` export ships pure state-machine helpers so that every service that
touches a sponsor wallet (`/sponsor`, `/relay`, `/settle`, …) drives off the
same primitives instead of re-implementing the nonce-conflict logic inline.

The canonical cycle is: classify what is at the nonce, decide what to do,
apply the decision to state, reconcile periodically against the mempool.

```ts
import {
  classifyOccupant,
  decideBroadcast,
  adoptOrphan,
  quarantine,
  reconcile,
  type HiroSponsorTxView,
  type SponsorLedger,
  type WalletCapacity,
} from "@aibtc/tx-schemas/core";

function handleConflict(
  wallet: WalletCapacity,
  ledger: SponsorLedger,
  nonce: number,
  mempoolHit: HiroSponsorTxView | null,
  sponsorAddress: string
) {
  const occupant = classifyOccupant(mempoolHit, sponsorAddress, ledger, nonce);

  const decision = decideBroadcast(
    wallet,
    { outcome: "nonce_conflict", isOrigin: false },
    { nonce, ledger, occupant }
  );

  switch (decision.kind) {
    case "rbf_with_fee":
      // re-sign at decision.fee, broadcast
      return wallet;
    case "adopt_then_rbf":
      // `adopt_then_rbf` is only emitted when the occupant was classified as
      // `sponsor_owned_orphan`, which requires a non-null mempool hit.
      return adoptOrphan(wallet, mempoolHit!);
    case "quarantine":
      return quarantine(wallet, decision.nonce, decision.reason, {
        txId: occupant.kind !== "untraceable" ? occupant.txId : undefined,
      });
    case "terminal":
      // mark the payment terminal with decision.reason
      return wallet;
    case "first_broadcast":
      return wallet;
  }
}

// Periodic reconciliation pass adopts unrecorded sponsor txs and flags drops:
const { wallet: next, ledger: nextLedger, adopted, dropped } = reconcile(
  wallet,
  ledger,
  mempoolReadByNonce,
  sponsorAddress
);
```

All helpers are pure: inputs → new state. No I/O, and time-sensitive helpers
accept an injectable `now` option for deterministic tests; otherwise they use
the current time by default.

### Canonical write pattern: two-phase broadcast

`LedgerEntry.status` captures whether a broadcast has round-tripped with the
node. The two-phase contract closes the edge-terminator / crash window where a
single-phase ledger write could claim `broadcast_sent` for a tx the node never
saw (or lose track of a tx the node did accept).

```
(no entry)        → pending_broadcast       [beginPendingBroadcast]
pending_broadcast → broadcast_sent          [resolveBroadcast("sent") | reconcile]
pending_broadcast → broadcast_failed        [resolveBroadcast("failed")]
broadcast_sent    → pending_broadcast       [new RBF attempt, new txId]
broadcast_failed  → pending_broadcast       [retry, new txId]
```

Write the ledger **before** the network call, resolve on return:

```ts
import {
  beginPendingBroadcast,
  resolveBroadcast,
  reconcile,
} from "@aibtc/tx-schemas/core";

let ledger = beginPendingBroadcast(ledger, {
  nonce,
  txId,
  fee,
});

try {
  const outcome = await broadcastTransaction(signedTx);
  ledger = resolveBroadcast(ledger, nonce, "sent", { lastOutcome: outcome });
} catch (err) {
  ledger = resolveBroadcast(ledger, nonce, "failed");
  throw err;
}
```

`decideBroadcast` refuses to issue a new decision while the entry is
`pending_broadcast`. It returns:

```ts
{ kind: "await_pending_broadcast", nonce, txId }
```

so the consumer resolves the prior call before a second broadcast can fire.

`reconcile()` sweeps survivors of crashes that dropped the resolve step:

- A `pending_broadcast` entry whose txId appears in the mempool is promoted
  to `broadcast_sent` automatically.
- A `pending_broadcast` entry absent from the mempool within
  `justBroadcastGraceSeconds` (default 30) is classified as
  `inFlightPendingIndex` — node may have accepted it; indexer just hasn't
  caught up.
- Past the grace window with no mempool hit, the entry is reported as
  `dropped` for caller inspection.

```ts
const { ledger: next, adopted, dropped, inFlightPendingIndex } = reconcile(
  wallet,
  ledger,
  mempoolReadByNonce,
  sponsorAddress,
  { justBroadcastGraceSeconds: 30 }
);
```

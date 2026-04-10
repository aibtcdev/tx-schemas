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

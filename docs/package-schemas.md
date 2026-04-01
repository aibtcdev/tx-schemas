# Package Schemas

`@aibtc/tx-schemas` is a single-package ESM library with one semantic source of truth and explicit transport adapters.

## Export Strategy

- `@aibtc/tx-schemas` exports the full public surface.
- `@aibtc/tx-schemas/core` exports canonical payment states, categories, terminal reasons, and shared primitives.
- `@aibtc/tx-schemas/core/enums` exports only state/category enums and maps.
- `@aibtc/tx-schemas/core/schemas` exports the canonical payment-status schema unions.
- `@aibtc/tx-schemas/terminal-reasons` exports terminal-reason enums and mappings.
- `@aibtc/tx-schemas/rpc` exports internal first-party RPC schemas.
- `@aibtc/tx-schemas/http` exports external HTTP schemas.

## Naming Rules

- `state` means the canonical domain payment state.
- `category` means the canonical domain grouping derived from `state`.
- `reason` means a terminal domain reason and is only valid for terminal failure states.
- `status` is reserved for transport-level wire fields already used by the relay and service APIs.

This keeps domain semantics stable even when transports choose different field names.

## Transport Boundaries

- `src/core` owns canonical semantics only.
- `src/rpc` owns first-party service-binding request and response shapes.
- `src/http` owns x402/HTTP request and response shapes plus polling/error envelopes.

RPC and HTTP may differ in field names, envelopes, and transport-specific error codes.

RPC and HTTP may not redefine:

- payment states
- payment categories
- terminal success versus terminal failure
- the meaning of `replaced` and `not_found`

## Delivery Semantics

The approval spec establishes these package-level semantics:

- `confirmed` is the only canonical terminal-success state.
- `submitted`, `queued`, `broadcasting`, and `mempool` are in-flight states.
- `failed`, `replaced`, and `not_found` are terminal-failure states.
- resource delivery during in-flight states is transport/product policy, not a new domain state

## Documented Assumptions

- Terminal reasons are normalized from the repo docs into stable package enums. Current relay/service error codes stay transport-specific in `rpc`.
- `paymentId` is treated as a relay-owned identifier with a `pay_` prefix because first-party polling endpoints require that prefix.
- Address and URL primitives are intentionally light-touch. This package validates shared API schemas, not chain-specific checksum rules.

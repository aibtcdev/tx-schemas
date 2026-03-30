# x402 Approval Spec: Reduce Before We Polish

This document defines what "approvable" means for the current x402 payment architecture across:

- `aibtcdev/skills`
- `aibtcdev/aibtc-mcp-server`
- `aibtcdev/landing-page` (`aibtc.com`)
- `aibtcdev/agent-news` (`aibtc.news`)
- `aibtcdev/x402-sponsor-relay`
- `aibtcdev/x402-api`

It applies the SpaceX engineering principles as follows:

1. Make the requirements less dumb.
2. Delete duplicated decision-making.
3. Simplify the system around one payment truth.
4. Accelerate by fixing one vertical slice at a time.
5. Automate the approval bar so regressions are blocked.

## 1. What We Are Keeping

We are not collapsing `HTTP` and `RPC` into one endpoint.

They serve different trust boundaries:

- `HTTP` is the external consumer interface for general agents and tools such as `skills`, `aibtc-mcp-server`, and other third-party x402 clients.
- `RPC` is the internal first-party interface for services such as `landing-page` and `agent-news`.

`x402-api` should be treated as an internal first-party service target for migration purposes, even if some current flows still use `HTTP`.

Transport duplication is acceptable.

Semantic duplication is not acceptable.

The approval target is:

- keep both `HTTP` and `RPC`
- enforce one canonical payment state model
- make transports thin adapters over a shared settlement core

## 2. Core Diagnosis

The current design feels like spaghetti because the same business decision is made in too many places:

- client code decides which relay errors are retryable and when to rebuild transactions
- service code decides whether `pending` still delivers the resource
- relay code owns the actual payment lifecycle and final chain-observed truth
- some route- or product-specific recovery logic compensates for gaps instead of consuming a narrow contract

There is also an important wallet-boundary constraint:

- clients control sender-wallet state and sender nonces
- relay controls sponsor-wallet state and sponsor nonces

That boundary is real and should be reflected in the approval model rather than abstracted away.

This creates three failure modes:

- status drift: `pending`, `confirmed`, `mempool`, `failed`, and `replaced` are interpreted differently depending on repo
- retry drift: client-specific retries and service-specific polling diverge from relay truth
- warning debt: errors and warnings are reduced by adding branches instead of deleting ambiguity

## 3. Canonical Domain Model

The relay must own the canonical payment state machine for the settlement domain it actually controls.

All other repos consume that model. They do not redefine it.

### Canonical Payment States

The shared payment lifecycle is:

`requires_payment -> submitted -> queued -> broadcasting -> mempool -> confirmed | failed | replaced | not_found`

These states mean:

- `requires_payment`: protected resource requires proof of payment
- `submitted`: relay accepted a submission request and assigned identity
- `queued`: accepted but not yet broadcasting
- `broadcasting`: relay is actively attempting sponsor/broadcast work
- `mempool`: transaction accepted by node/network and awaiting finality
- `confirmed`: chain-observed success
- `failed`: terminal failure
- `replaced`: terminal failure caused by nonce replacement or supersession
- `not_found`: missing, expired, or unknown payment identity

### Canonical State Categories

Every state must fit one category:

- pre-payment: `requires_payment`
- in-flight: `submitted`, `queued`, `broadcasting`, `mempool`
- terminal-success: `confirmed`
- terminal-failure: `failed`, `replaced`, `not_found`

No repo may invent a separate terminal category.

### Canonical Response Contract

All adapters must map onto the same domain contract:

- success response: resource may be delivered only for `confirmed`
- in-flight response: caller receives payment status and payment identity, but resource delivery depends on product policy
- failure response: no resource delivery

### Wallet Responsibility Boundary

The shared architecture must preserve blockchain reality:

- client wallet owner is responsible for sender nonce correctness and sender-side recovery
- relay is responsible for sponsor nonce correctness, sponsor-side ordering, and sponsor-side recovery

This means:

- the relay must not pretend it can fully repair sender-wallet nonce state
- clients must not pretend they can interpret sponsor-wallet contention better than the relay
- cross-boundary errors should be surfaced explicitly instead of hidden behind generic retry loops

The `gin rummy` style ordering logic is a sponsor-wallet concern and belongs in relay-owned domain behavior.

Sender-wallet recovery mechanisms such as replacing or flushing a stuck transaction are client concerns, even if first-party clients provide helpers for them.

### Approval Invariant on Resource Delivery

For internal services and paid protected resources, the default invariant is:

- do not deliver the protected resource on `pending` or any in-flight state

If a product intentionally wants "deliver while payment is still in-flight", that behavior must be treated as an explicit exception, documented per route, and justified as safe. It must not be the hidden default semantics of `pending`.

The approval preference is to remove "pending but delivered" wherever possible.

## 4. Domain Ownership

The architecture is approvable only if domain ownership is narrow.

### Relay Owns

`x402-sponsor-relay` is the domain owner for:

- payment state transitions
- settlement truth
- retryable versus terminal settlement outcomes
- payment identity lifecycle
- nonce conflict and replacement semantics
- chain-observed finalization
- sponsor-wallet ordering and sponsor-wallet healing

The relay may expose this through both `RPC` and `HTTP`, but the transport layer must not fork the state model.

### External Client Adapters Own

`skills`, `aibtc-mcp-server`, and external `HTTP` consumers own:

- offer validation
- wallet readiness checks
- transaction construction and signing
- transport submission
- bounded client retries for transport failures only
- sender-wallet nonce hygiene and sender-side recovery actions

They do not own:

- interpreting chain finality independently of relay truth
- route-specific payment state enums
- business-specific terminal status invention
- sponsor-wallet ordering policy

### Internal Service Adapters Own

`landing-page` and `agent-news` own:

- enforcing route-level payment requirement
- calling relay over `RPC`
- converting relay status into route responses
- exposing `payment-status` polling endpoints where needed

They do not own:

- custom payment lifecycle logic
- product-specific redefinition of `confirmed`, `failed`, `replaced`, or `not_found`
- special-case settlement behavior that bypasses shared semantics

### x402-api

`x402-api` is our service and should be treated as an internal first-party consumer.

The target direction is to migrate it toward the same `RPC`-backed internal contract used by other first-party services, while preserving external `HTTP` support for true third-party consumers.

It must not become a second settlement brain.

## 5. Transport Rules

Transport-specific behavior is allowed only at the adapter boundary.

### Allowed `HTTP` Differences

- auth shape
- header shape
- external error formatting
- polling ergonomics for external consumers

### Allowed `RPC` Differences

- service binding mechanics
- internal auth and circuit-breaker behavior
- internal error transport format

### Forbidden Differences

- a different payment state enum
- a different definition of terminal success
- a different definition of retryable settlement failure
- a different meaning of `not_found` or `replaced`
- a different resource-delivery rule for the same protected resource type without explicit route documentation

## 6. Retry Policy

The current system will not become approvable by layering more recovery branches into clients and services.

Retry policy must be reduced and made explicit.

### Client Retry Policy

Clients may retry only for:

- transient network/transport failures
- explicit relay retryable responses
- bounded transaction rebuild when relay says sender nonce is stale or gapped
- sender-wallet recovery actions that are clearly client-owned

Clients may not:

- infer confirmation from side channels as a normal control path
- carry product-specific auto-recovery logic that bypasses shared relay status APIs unless it is a temporary migration shim
- assume responsibility for sponsor-wallet healing

### Service Retry Policy

Services may:

- poll the relay for bounded in-flight resolution
- return a stable `paymentId` for caller polling when budget is exhausted

Services may not:

- implement settlement-specific state transitions outside relay contracts
- swallow terminal relay failures and convert them into ambiguous route behavior

### Relay Retry Policy

The relay owns:

- sponsor contention retries
- queue rescheduling
- nonce conflict handling
- mempool observation and chain finalization
- sponsor-wallet healing such as gap-fill, reset, and ordering strategies

If retry semantics are needed, they should move toward the relay, not outward toward every consumer.

## 7. Shared Types and Contracts

Approval requires a shared contract package or equivalent shared source of truth.

At minimum, all consumers must converge on:

- one `PaymentState` enum
- one `PaymentStateCategory` mapping
- one `PaymentTerminalReason` or equivalent error taxonomy
- one settlement response shape for `HTTP`
- one settlement response shape for `RPC`
- one rule set for which states permit resource delivery

For first-party production apps, this shared source of truth should start small:

- shared types and schemas first
- shared transport/domain adapters second if they clearly reduce drift

The goal is alignment, not framework overhead.

The initial rollout should be first-party focused:

- `x402-sponsor-relay`
- `landing-page`
- `agent-news`
- `x402-api`

But it must be designed with `skills` and `aibtc-mcp-server` in mind from the start, because the external `HTTP` contract is primarily for those clients and likely overlaps heavily with the first-party response model.

That means:

- do not build an internal package that ignores external client needs
- define `HTTP` response shapes once, with external clients as first-class consumers
- allow first-party apps to adopt shared internal types first without forcing immediate runtime changes in all clients

The recommended sequence is:

- define shared domain enums and schemas used by all repos
- define shared first-party `RPC` response types for internal apps
- define shared `HTTP` response types with `skills` and `aibtc-mcp-server` compatibility in mind
- migrate first-party apps first
- let client repos follow on the same schemas rather than inventing a second contract later

This can be implemented as:

- a shared package, or
- copied generated types from relay-owned schemas, or
- a contract repo consumed by all relevant projects

What is not acceptable is hand-maintained parallel type definitions drifting across repos.

## 8. Repo-by-Repo Approval Expectations

### `x402-sponsor-relay`

This repo is approvable when:

- state transitions are explicit and testable
- `RPC` and `HTTP` adapters both map to the same domain model
- impossible transitions are rejected
- terminal reasons are enumerable and stable
- settlement warnings are either actionable or removed

This repo is not approvable if transport adapters contain divergent business semantics.

### `landing-page`

This repo is approvable when:

- payment verification is adapter-only
- route handlers use shared payment states
- pending handling is explicit and documented per route
- route-specific compensation logic is reduced or deleted

This repo is not approvable if inbox or protected-route flows redefine relay truth.

### `agent-news`

This repo is approvable when:

- it consumes the same adapter contract as `landing-page`
- route behavior matches shared invariants
- any divergence from `landing-page` is intentional and documented at the product layer

This repo is not approvable if it independently hardens around relay edge cases with custom semantics.

### `skills`

This repo is approvable when:

- it performs signing and bounded submit/retry work only
- recovery logic is generic and contract-driven
- product-specific inbox logic is removed or isolated behind shared utilities with tests
- its `HTTP` contract usage stays compatible with the shared response schemas adopted by first-party apps

This repo is not approvable if external client code becomes a second settlement coordinator.

### `aibtc-mcp-server`

This repo is approvable when:

- it uses the same external client adapter rules as `skills`
- tool-specific behavior is isolated from payment semantics
- inbox tools do not carry private interpretations of relay outcomes
- its `HTTP` contract usage stays compatible with the shared response schemas adopted by first-party apps

This repo is not approvable if MCP tools grow their own state machine variants.

### `x402-api`

This repo is approvable when:

- it is moved toward the same first-party internal contract as `landing-page` and `agent-news`
- it consumes shared payment types instead of inventing local settlement semantics
- it does not normalize relay failures into new ad hoc statuses

This repo is not approvable if it accumulates special-case settlement behavior separate from the first-party contract.

## 9. Approval Checklist

The application is approvable only when all of the following are true:

- `HTTP` and `RPC` are documented as separate transports over the same payment domain model.
- One canonical payment state enum exists and is used across all participating repos.
- One canonical terminal error taxonomy exists and is used across all participating repos.
- Shared `HTTP` response schemas are defined with `skills` and `aibtc-mcp-server` as intended consumers.
- Relay is the sole owner of settlement truth and state transitions.
- Relay is the sole owner of sponsor-wallet ordering and sponsor-wallet healing behavior.
- Client adapters clearly own sender-wallet nonce hygiene and sender-side recovery.
- Client repos are adapter-only and perform only bounded retries.
- Internal services are adapter-only and do not redefine payment semantics.
- `pending` delivery behavior is either removed or explicitly documented as a route-level exception.
- `paymentId` polling semantics are consistent across internal and external consumers.
- Route- or product-specific recovery logic is either deleted or justified as a temporary migration shim.
- Warnings in touched x402 code paths are reduced to zero or explicitly waived with rationale.
- Contract tests verify the same outcomes for `HTTP` and `RPC`.
- End-to-end tests cover `confirmed`, `failed`, `replaced`, and `not_found`.

If any of those are false, the system is not ready for approval and more branch-level cleanup will mostly add entropy.

## 10. Required Test Matrix

Approval requires automated tests that enforce the architecture, not just the implementation.

### Contract Tests

- `HTTP` and `RPC` return equivalent domain statuses for equivalent relay outcomes.
- `confirmed` is the only default state that authorizes protected resource delivery.
- `failed`, `replaced`, and `not_found` are always terminal failures.
- in-flight states serialize consistently with payment identity and polling instructions.
- `HTTP` response schemas satisfy both first-party service callers and external client consumers such as `skills` and `aibtc-mcp-server`.

### State Transition Tests

- invalid transitions are rejected
- `submitted -> queued -> broadcasting -> mempool -> confirmed` is accepted
- `mempool -> replaced` is accepted
- `failed -> confirmed` is rejected
- `replaced -> confirmed` is rejected

### Adapter Tests

- `skills` and `aibtc-mcp-server` use shared external payment types
- `landing-page`, `agent-news`, and `x402-api` use shared internal payment types
- route handlers do not deliver resources on terminal failure
- sender-wallet errors and sponsor-wallet errors are surfaced as distinct contract categories where applicable

### End-to-End Tests

- external HTTP client can pay and receive confirmed result
- internal RPC service can pay and receive confirmed result
- in-flight payment returns stable polling identity
- terminal failure remains terminal across repeated polls

## 11. Migration Sequence

This should not be attacked as a broad cleanup.

Use a reduction-first sequence.

### Phase 1: Freeze the Contract

- define canonical states and terminal reasons
- define shared response schemas
- document delivery invariants
- validate `HTTP` schema shape against `skills` and `aibtc-mcp-server` usage before broad migration

No new payment branches should be added until this exists.

### Phase 2: Collapse Adapters

- make `landing-page` and `agent-news` consume the same internal adapter contract
- migrate `x402-api` toward the same internal adapter contract
- make `skills` and `aibtc-mcp-server` consume the same external adapter contract
- move retry semantics inward toward relay where possible

### Phase 3: Delete Compensating Logic

- remove route-specific recovery branches
- remove product-specific status reinterpretation
- remove dead warnings after the branches disappear

### Phase 4: Enforce in CI

- shared type drift checks
- contract tests
- end-to-end state coverage
- warning budget for touched x402 paths

## 12. SpaceX Principles Applied Concretely

### 1. Make the requirements less dumb

The requirement is not "handle all weird cases everywhere."

The requirement is:

- one payment truth
- two transports
- narrow adapters
- explicit delivery invariants

### 2. Delete the part or process

Delete duplicate semantics before fixing more warnings.

Candidate deletions:

- route-specific payment state reinterpretation
- inbox-specific payment recovery that should live in shared client code
- product-specific fallback branches that exist only because contracts are vague

Candidate clarifications that should remain explicit:

- sender-wallet recovery is client-owned
- sponsor-wallet healing is relay-owned
- first-party app alignment can begin with shared types before shared runtime helpers

### 3. Simplify or optimize

Simplify around one relay-owned lifecycle.

Do not optimize local branches that should disappear after contract reduction.

### 4. Accelerate cycle time

Prove one vertical slice at a time:

- external HTTP consumer slice
- internal RPC consumer slice

Only after both converge on the same domain truth should broad warning cleanup continue.

### 5. Automate

Approval must be enforced by tests, schemas, and CI checks.

Without automation, the system will drift back into per-repo semantics.

## 13. Decision

The current system should be reviewed against this standard:

- approve transport plurality
- reject semantic plurality

If the team can show one relay-owned state model, thin transport adapters, explicit delivery invariants, and automated contract coverage, the application is approvable.

If not, more warning and error cleanup will likely make the system harder to reason about instead of easier.

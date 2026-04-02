# Workers Baseline For `@aibtc/tx-schemas` Consumers

This document is a companion to the `@aibtc/tx-schemas` package and the boring transaction state machine contract.

It defines the default Cloudflare Worker usage model we expect first-party repos to follow while consuming the shared payment schemas.

The goal is to reduce cross-repo drift without forcing every repo into the same storage engine or app architecture.

## Package Role

- `@aibtc/tx-schemas` is the schema and semantics anchor.
- It defines the caller-facing payment contract, not the relay runtime, not a Stacks.js wrapper, and not a generic Worker framework.
- `x402-sponsor-relay` remains the payment domain owner for payment identity, in-flight status, and terminal settlement truth.
- First-party apps and clients should adapt their Worker code to this package instead of copying relay-local types.

## Transport Split

Use this split by default:

- first-party Workers inside the AIBTC Cloudflare account should use the `x402-sponsor-relay` Service Binding with RPC for synchronous internal payment operations
- external agents and non-first-party consumers should use the relay's public HTTP interface
- `x402-api` stays on HTTP during the current stabilization rollout; future RPC migration is follow-up work, not part of this baseline

Rationale:

- RPC service bindings are the boring internal path for first-party Workers because they avoid public URL hops and keep the relay contract inside the account boundary
- HTTP remains the stable integration surface for agents, third parties, and any consumer that cannot rely on internal account bindings

## Repo Baseline

These defaults should be kept aligned across first-party Worker repos unless a repo has a concrete reason to diverge:

- use `wrangler.jsonc` as the primary Worker config file
- stay on Wrangler v4
- keep a current `compatibility_date` and bump it intentionally instead of letting it drift indefinitely
- use `nodejs_compat_v2` by default unless a repo has a specific compatibility reason not to
- keep standard environment names: `staging` and `production`
- prefer standard binding names for shared infrastructure:
  - `LOGS` for the `worker-logs` Service Binding
  - `X402_RELAY` for the relay Service Binding when the repo is a first-party app using RPC
- generate and check Worker env types in each repo so binding drift is caught in review rather than at runtime

Drift is natural. Silent drift is the problem.

## Observability Baseline

For this rollout, first-party Worker repos should standardize on:

- `worker-logs` as the shared logging path
- Worker `observability` disabled in repo configs

Rationale:

- prior attempts to compile and compare data cleanly across multiple Workers through Cloudflare observability have been operationally noisy
- `worker-logs` is already the shared cross-worker path in the AIBTC repos

This means:

- keep the `LOGS` binding in first-party Worker repos
- disable Worker observability flags unless there is an explicit exception with a concrete operational reason
- do not treat native observability as part of the payment contract rollout

## Product Conventions

Use the Cloudflare product surface this way by default:

1. Service Bindings with RPC
   - for synchronous first-party Worker-to-Worker calls
   - especially app -> relay calls inside the same Cloudflare account
2. HTTP endpoints
   - for external agents and public consumers
   - for `x402-api` during the current stabilization phase
3. Queues
   - for simple asynchronous background work and buffering
   - especially where serialization is part of correctness, such as relay payment processing
4. Durable Objects
   - for per-key ownership, coordination, or app-local state
   - not as a requirement that every app share the same storage pattern
   - avoid turning DOs into a cross-app staging default, since locality and cold-start placement can produce different latency tradeoffs depending on where callers are coming from
5. Workflows
   - not part of the baseline for this rollout
   - current flows are simple enough that Workflows would add churn without solving the main coordination problem

## Smart Placement

Smart Placement is not part of the baseline.

- keep it only where it has a measured benefit
- remove it where it adds complexity or false confidence
- do not assume it improves relay RPC usage automatically

Repos may still opt into it for repo-specific fetch-heavy behavior, but it should not be treated as part of the shared payment contract.

## Confirmed-Only Staging

Confirmed-only staging should stay app-local by default.

- `landing-page` and `agent-news` should keep provisional staging in app-owned storage keyed by relay-owned `paymentId`
- pending states mean staged but not finalized
- finalize exactly once on `confirmed`
- discard or expire on `failed`, `replaced`, or `not_found`

Do not move this into a relay-owned generic holding tank by default.

Rationale:

- staging payload shape is product-specific
- future apps may need different provisional storage and cleanup behavior
- centralizing staging in the relay too early would increase coupling before the shared shape is proven

Possible future follow-up:

- if several first-party apps converge on the same staged-record lifecycle and payload envelope, the relay may later define a narrower handoff contract around payment success notifications
- that is not required for the current stabilization work

## Source Of Truth Boundaries

- relay owns payment identity, duplicate reuse, public status projection, and terminal settlement truth
- app Workers own product-specific staged data, delivery timing, and final side effects
- clients own sender-side rebuild actions when terminal reasons indicate sender nonce problems

These boundaries are intentionally boring. Keep them boring.

## Shared Sponsor Pool Operating Policy

The relay currently uses one shared sponsor wallet pool for x402 settlements and other sponsored transaction flows.

That is acceptable for this rollout as long as the relay preserves forward progress.

Operational rules:

- tx type does not matter to sponsor wallets; validity and nonce progression do
- no single sender may stall unrelated senders or the shared sponsor pool
- sender uncertainty must stay sender-local whenever possible
- sponsor-side congestion is relay-owned and should be recovered aggressively

Sender-side policy:

- if the relay can prove a sender tx is no longer valid, it should fail fast
- if the relay observes a later confirmed sender nonce, older pending sender nonces become terminal and should not keep occupying dispatchable paths
- if a sender tx may become valid later, it may remain held in sender-local state, but it must not poison global sponsor progress
- sender-side `TooMuchChaining` should be treated as an immediate sender failure for the current attempt; sender-local future handling is acceptable, but not global blocking

Sponsor-side policy:

- sponsor-side `TooMuchChaining` should be treated as abnormal relay congestion, not normal steady-state behavior
- if a sponsor wallet is not making forward progress for minutes rather than block-scale seconds, the relay should trigger automated recovery
- recovery should prefer a bounded ladder:
  - resync
  - replay/head-bump/gap-fill
  - flush-wallet only as last resort
- the relay should prefer local intent/state and bounded inference over repeated hot-path Hiro lookups

Health definition:

- relay health means sponsor wallets keep moving transactions through the system
- queue depth alone is not a health definition
- forward progress matters more than explaining every pending tx in real time

Practical implication:

- mixed x402 and non-x402 traffic may share capacity, but neither flow should be able to corrupt the other's payment semantics or stall global sponsor progress because of one bad sender

## Current Default Matrix

| Consumer type | Default relay transport | Poll/status transport | Delivery/staging owner |
| --- | --- | --- | --- |
| First-party app Worker | Service Binding RPC | Service Binding RPC or app HTTP adapter | app-local |
| External agent consumer | HTTP | HTTP | consumer-local |
| `x402-api` during stabilization | HTTP | HTTP | service-local |

## Open Follow-Ups

- Should we add a small shared checklist for Worker repo bootstrap so `wrangler.jsonc`, binding names, generated env types, and `LOGS` setup start consistent?
- Should `x402-api` move to relay RPC after the package and repo baselines settle?
- If several apps converge on the same confirmed-only staging record shape, is there enough evidence to standardize a relay-to-app success handoff later?

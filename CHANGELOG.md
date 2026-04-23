# Changelog

## [1.1.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v1.0.0...tx-schemas-v1.1.0) (2026-04-23)


### Features

* **rpc:** add optional paymentIdentifier to RpcSubmitPaymentArgsSchema for V2 parity ([#29](https://github.com/aibtcdev/tx-schemas/issues/29)) ([159ad69](https://github.com/aibtcdev/tx-schemas/commit/159ad69c2019bf847aa8ec7f2f48c31c33182f0a))

## [1.0.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.8.0...tx-schemas-v1.0.0) (2026-04-15)


### ⚠ BREAKING CHANGES

* **core:** two-phase broadcast status + reconcile grace window ([#26](https://github.com/aibtcdev/tx-schemas/issues/26))

### Features

* **core:** two-phase broadcast status + reconcile grace window ([#26](https://github.com/aibtcdev/tx-schemas/issues/26)) ([cbf7261](https://github.com/aibtcdev/tx-schemas/commit/cbf72610a44dd06b2cfe9aa02bde5ac57bc5fc09))

## [0.8.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.7.0...tx-schemas-v0.8.0) (2026-04-15)


### Features

* **core:** sponsor-wallet state-machine helpers (closes [#22](https://github.com/aibtcdev/tx-schemas/issues/22)) ([#23](https://github.com/aibtcdev/tx-schemas/issues/23)) ([75ed8bb](https://github.com/aibtcdev/tx-schemas/commit/75ed8bb813e714482265e7dc52aaa55d1e2b96c2))

## [0.7.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.6.0...tx-schemas-v0.7.0) (2026-04-10)


### Features

* **core:** document machine-readable contract exports for downstream consumers ([#20](https://github.com/aibtcdev/tx-schemas/issues/20)) ([d5dacca](https://github.com/aibtcdev/tx-schemas/commit/d5dacca448ac63b47a0ba1429e3493392344a9cf))

## [0.6.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.5.2...tx-schemas-v0.6.0) (2026-04-08)


### Features

* **news:** document news schema exports and lifecycle contract ([1f9a973](https://github.com/aibtcdev/tx-schemas/commit/1f9a97334e2b67727ddd53cd6484e376f57a50ec))

## [0.5.2](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.5.1...tx-schemas-v0.5.2) (2026-04-07)


### Bug Fixes

* **news:** align beat-editor and editor-earning schemas to actual DB shape ([#14](https://github.com/aibtcdev/tx-schemas/issues/14)) ([57c1f34](https://github.com/aibtcdev/tx-schemas/commit/57c1f3461ba06057202e0daf07895a38396d5889))

## [0.5.1](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.5.0...tx-schemas-v0.5.1) (2026-04-06)


### Bug Fixes

* consistency cleanup for inline enum and legacy aliases ([#12](https://github.com/aibtcdev/tx-schemas/issues/12)) ([cd10f6c](https://github.com/aibtcdev/tx-schemas/commit/cd10f6c26049d593e5ff84461285a5c5cd2b9980))

## [0.5.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.4.0...tx-schemas-v0.5.0) (2026-04-06)


### Features

* **news:** add news editorial domain schemas ([#10](https://github.com/aibtcdev/tx-schemas/issues/10)) ([04063e2](https://github.com/aibtcdev/tx-schemas/commit/04063e24390c7e4f2ab4ad8557f5ef7e44281010))

## [0.4.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.3.0...tx-schemas-v0.4.0) (2026-04-06)


### Features

* add wallet state core schemas for nonce outcomes, capacity, and sender queues ([d6876b9](https://github.com/aibtcdev/tx-schemas/commit/d6876b939d19da1ec8c96ebed3102aa95a37e2d8))
* extend terminal reasons, RPC error codes, and diagnostics for wallet state ([ab113eb](https://github.com/aibtcdev/tx-schemas/commit/ab113eb3477c8a82c503547a31f8528666bead40))
* wallet state schemas (Phases 4-5) ([b5b7ea2](https://github.com/aibtcdev/tx-schemas/commit/b5b7ea21d65dfa74f70033c773c364857a9fd7c7))


### Bug Fixes

* add runtime invariants per arc0btc review suggestions ([7b66db6](https://github.com/aibtcdev/tx-schemas/commit/7b66db634ebd671b4c1239a22a64c690c8c7bfc9))
* enforce schema invariants per PR review feedback ([0553735](https://github.com/aibtcdev/tx-schemas/commit/0553735f61639158ddafc80a86836631bea09880))

## [0.3.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.2.2...tx-schemas-v0.3.0) (2026-04-03)


### Features

* align duplicate submit rpc contract with canonical in-flight states ([dedcf21](https://github.com/aibtcdev/tx-schemas/commit/dedcf213cd1a16c762a46199a7b5a5dc4421cea2))

## [0.2.2](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.2.1...tx-schemas-v0.2.2) (2026-04-02)


### Bug Fixes

* add RPC poll URL hint to payment check schema ([41cee0a](https://github.com/aibtcdev/tx-schemas/commit/41cee0a45b1c3a056ad2955d84b753d46edf0ec5))

## [0.2.1](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.2.0...tx-schemas-v0.2.1) (2026-04-02)


### Bug Fixes

* publish worker baseline and duplicate recovery docs ([75b7dd1](https://github.com/aibtcdev/tx-schemas/commit/75b7dd1f1705d9767595de54f8ab862aada1a7cd))

## [0.2.0](https://github.com/aibtcdev/tx-schemas/compare/tx-schemas-v0.1.0...tx-schemas-v0.2.0) (2026-04-02)


### Features

* add initial tx-schemas package ([97f06a8](https://github.com/aibtcdev/tx-schemas/commit/97f06a8c67a26814b6506000c0f5eb6e2f5a47b3))
* stabilize boring payment state contract ([7bc2664](https://github.com/aibtcdev/tx-schemas/commit/7bc26642b2f50c66c874acb038e872ec41101651))


### Bug Fixes

* refresh lockfile for npm ci ([d1b6796](https://github.com/aibtcdev/tx-schemas/commit/d1b6796e148731d1cfc09381771a677a67b3e009))

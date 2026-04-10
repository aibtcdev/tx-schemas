import { z } from "zod";

export const PAYMENT_STATES = [
  "requires_payment",
  "queued",
  "broadcasting",
  "mempool",
  "confirmed",
  "failed",
  "replaced",
  "not_found",
] as const;

export const TRACKED_PAYMENT_STATES = [
  "queued",
  "broadcasting",
  "mempool",
  "confirmed",
  "failed",
  "replaced",
  "not_found",
] as const;

export const PAYMENT_STATE_CATEGORIES = [
  "pre-payment",
  "in-flight",
  "terminal-success",
  "terminal-failure",
] as const;

export const PRE_PAYMENT_STATES = ["requires_payment"] as const;

export const IN_FLIGHT_STATES = [
  "queued",
  "broadcasting",
  "mempool",
] as const;

export const TERMINAL_SUCCESS_STATES = ["confirmed"] as const;

export const TERMINAL_FAILURE_STATES = [
  "failed",
  "replaced",
  "not_found",
] as const;

export const PaymentStateSchema = z.enum(PAYMENT_STATES);
export const TrackedPaymentStateSchema = z.enum(TRACKED_PAYMENT_STATES);
export const PaymentStateCategorySchema = z.enum(PAYMENT_STATE_CATEGORIES);
export const InFlightPaymentStateSchema = z.enum(IN_FLIGHT_STATES);
export const TerminalFailureStateSchema = z.enum(TERMINAL_FAILURE_STATES);

export const PAYMENT_STATE_TO_CATEGORY = {
  requires_payment: "pre-payment",
  queued: "in-flight",
  broadcasting: "in-flight",
  mempool: "in-flight",
  confirmed: "terminal-success",
  failed: "terminal-failure",
  replaced: "terminal-failure",
  not_found: "terminal-failure",
} as const satisfies Record<(typeof PAYMENT_STATES)[number], (typeof PAYMENT_STATE_CATEGORIES)[number]>;

export const PAYMENT_STATE_DEFAULT_DELIVERY = {
  requires_payment: false,
  queued: false,
  broadcasting: false,
  mempool: false,
  confirmed: true,
  failed: false,
  replaced: false,
  not_found: false,
} as const satisfies Record<(typeof PAYMENT_STATES)[number], boolean>;

export const PaymentStateCategoryByState = PAYMENT_STATE_TO_CATEGORY;
export const paymentStateCategoryByState = PAYMENT_STATE_TO_CATEGORY;
export const PaymentStateDefaultDeliveryByState = PAYMENT_STATE_DEFAULT_DELIVERY;
export const paymentStateDefaultDeliveryByState = PAYMENT_STATE_DEFAULT_DELIVERY;

export const CANONICAL_POLLING_IDENTITY_FIELDS = [
  "paymentId",
  "checkStatusUrl",
] as const;

// Array order is part of the contract: downstream consumers may rely on this
// sequence as the required relay lifecycle bridge from acceptance to terminality.
export const RELAY_LIFECYCLE_BRIDGE = [
  {
    step: "sender_hand_accepted",
    callerFacingStates: ["queued"] as const,
    contract: "relay accepted sender-hand ownership for this paymentId",
  },
  {
    step: "queued_for_sponsor_dispatch",
    callerFacingStates: ["queued"] as const,
    contract: "relay queued the same paymentId for sponsor dispatch",
  },
  {
    step: "sponsor_broadcasted",
    callerFacingStates: ["broadcasting", "mempool"] as const,
    contract: "relay broadcasted the same paymentId and may expose chain visibility",
  },
  {
    step: "confirmed",
    callerFacingStates: ["confirmed"] as const,
    contract: "relay observed canonical confirmed settlement for the same paymentId",
  },
  {
    step: "replaced",
    callerFacingStates: ["replaced"] as const,
    contract: "relay marked the old paymentId terminal because another tx won the nonce",
  },
  {
    step: "terminal_failed",
    callerFacingStates: ["failed"] as const,
    contract: "relay marked the paymentId terminal failed with a normalized terminalReason",
  },
] as const;

export const PAYMENT_STATE_TRANSITIONS = {
  requires_payment: [] as const,
  queued: ["queued", "broadcasting", "failed"] as const,
  broadcasting: ["queued", "mempool", "failed"] as const,
  mempool: ["mempool", "confirmed", "failed", "replaced"] as const,
  confirmed: [] as const,
  failed: [] as const,
  replaced: [] as const,
  not_found: [] as const,
} as const satisfies Record<(typeof PAYMENT_STATES)[number], readonly (typeof PAYMENT_STATES)[number][]>;

export const PaymentStateTransitionMap = PAYMENT_STATE_TRANSITIONS;
export const paymentStateTransitionMap = PAYMENT_STATE_TRANSITIONS;
export const ProtectedResourceDeliverableStateSchema = z.literal("confirmed");
export const CanonicalDomainBoundary = {
  defaultProtectedResourceDelivery: {
    defaultRule: "deliver-only-on-confirmed",
    deliverableStates: ["confirmed"] as const,
  },
  paymentIdentity: {
    owner: "relay",
    field: "paymentId",
    idempotencyInputField: "payment-identifier",
    idempotencyInputRole: "idempotency-input-only",
    duplicateSubmissionPolicy: "same-submission-reuses-paymentId-until-terminal-outcome",
  },
  pollingIdentity: {
    canonicalFields: CANONICAL_POLLING_IDENTITY_FIELDS,
    missingCanonicalIdentityPolicy: "downstream-must-not-invent-paymentId-or-checkStatusUrl",
  },
  relayLifecycleBridgeOrdering: "ordered-transition-sequence",
  relayLifecycleBridge: RELAY_LIFECYCLE_BRIDGE,
  recoveryBoundaries: {
    senderOwned: [
      "sender nonce correctness",
      "transaction rebuild after sender nonce stale/gap",
      "sender-wallet recovery actions",
    ] as const,
    relayOwned: [
      "payment identity lifecycle",
      "sponsor ordering and sponsor nonce recovery",
      "in-flight payment transitions and terminal settlement truth",
    ] as const,
  },
  transportBoundaries: {
    sharedDomain: ["state", "category", "terminal-reason", "paymentId ownership"] as const,
    rpc: ["service-binding request/response shapes", "internal relay error codes"] as const,
    http: ["x402 request/response shapes", "polling and error envelopes"] as const,
  },
} as const;

export type PaymentState = z.infer<typeof PaymentStateSchema>;
export type TrackedPaymentState = z.infer<typeof TrackedPaymentStateSchema>;
export type PaymentStateCategory = z.infer<typeof PaymentStateCategorySchema>;

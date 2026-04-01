import { z } from "zod";

export const PAYMENT_STATES = [
  "requires_payment",
  "submitted",
  "queued",
  "broadcasting",
  "mempool",
  "confirmed",
  "failed",
  "replaced",
  "not_found",
] as const;

export const TRACKED_PAYMENT_STATES = [
  "submitted",
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
  "submitted",
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
  submitted: "in-flight",
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
  submitted: false,
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

export const PAYMENT_STATE_TRANSITIONS = {
  requires_payment: [] as const,
  submitted: ["queued", "failed"] as const,
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
  transportBoundaries: {
    sharedDomain: ["state", "category", "terminal-reason"] as const,
    rpc: ["service-binding request/response shapes", "internal relay error codes"] as const,
    http: ["x402 request/response shapes", "polling and error envelopes"] as const,
  },
} as const;

export type PaymentState = z.infer<typeof PaymentStateSchema>;
export type TrackedPaymentState = z.infer<typeof TrackedPaymentStateSchema>;
export type PaymentStateCategory = z.infer<typeof PaymentStateCategorySchema>;

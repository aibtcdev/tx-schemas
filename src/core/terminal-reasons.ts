import { z } from "zod";

export const FAILED_TERMINAL_REASONS = [
  "invalid_transaction",
  "not_sponsored",
  "sender_nonce_stale",
  "sender_nonce_gap",
  "sender_nonce_duplicate",
  "queue_unavailable",
  "sponsor_failure",
  "broadcast_failure",
  "chain_abort",
  "internal_error",
  "sponsor_exhausted",
  "sponsor_nonce_conflict",
  "origin_chaining_limit",
  "broadcast_rate_limited",
  "sender_hand_expired",
] as const;

export const REPLACED_TERMINAL_REASONS = [
  "nonce_replacement",
  "superseded",
] as const;

export const NOT_FOUND_TERMINAL_REASONS = [
  "expired",
  "unknown_payment_identity",
] as const;

export const TERMINAL_REASONS = [
  ...FAILED_TERMINAL_REASONS,
  ...REPLACED_TERMINAL_REASONS,
  ...NOT_FOUND_TERMINAL_REASONS,
] as const;

export const TERMINAL_REASON_CATEGORIES = [
  "validation",
  "sender",
  "relay",
  "settlement",
  "replacement",
  "identity",
] as const;

export const FailedTerminalReasonSchema = z.enum(FAILED_TERMINAL_REASONS);
export const ReplacedTerminalReasonSchema = z.enum(REPLACED_TERMINAL_REASONS);
export const NotFoundTerminalReasonSchema = z.enum(NOT_FOUND_TERMINAL_REASONS);
export const TerminalReasonSchema = z.enum(TERMINAL_REASONS);
export const TerminalReasonCategorySchema = z.enum(TERMINAL_REASON_CATEGORIES);

export const TERMINAL_REASON_TO_STATE = {
  invalid_transaction: "failed",
  not_sponsored: "failed",
  sender_nonce_stale: "failed",
  sender_nonce_gap: "failed",
  sender_nonce_duplicate: "failed",
  queue_unavailable: "failed",
  sponsor_failure: "failed",
  broadcast_failure: "failed",
  chain_abort: "failed",
  internal_error: "failed",
  sponsor_exhausted: "failed",
  sponsor_nonce_conflict: "failed",
  origin_chaining_limit: "failed",
  broadcast_rate_limited: "failed",
  sender_hand_expired: "failed",
  nonce_replacement: "replaced",
  superseded: "replaced",
  expired: "not_found",
  unknown_payment_identity: "not_found",
} as const satisfies Record<(typeof TERMINAL_REASONS)[number], "failed" | "replaced" | "not_found">;

export const paymentTerminalStateByReason = TERMINAL_REASON_TO_STATE;

export const TERMINAL_REASON_TO_CATEGORY = {
  invalid_transaction: "validation",
  not_sponsored: "validation",
  sender_nonce_stale: "sender",
  sender_nonce_gap: "sender",
  sender_nonce_duplicate: "sender",
  queue_unavailable: "relay",
  sponsor_failure: "relay",
  internal_error: "relay",
  broadcast_failure: "settlement",
  chain_abort: "settlement",
  sponsor_exhausted: "relay",
  sponsor_nonce_conflict: "relay",
  origin_chaining_limit: "sender",
  broadcast_rate_limited: "settlement",
  sender_hand_expired: "sender",
  nonce_replacement: "replacement",
  superseded: "replacement",
  expired: "identity",
  unknown_payment_identity: "identity",
} as const satisfies Record<(typeof TERMINAL_REASONS)[number], (typeof TERMINAL_REASON_CATEGORIES)[number]>;

export const paymentTerminalReasonCategoryByReason = TERMINAL_REASON_TO_CATEGORY;

export const TERMINAL_REASON_CATEGORY_HANDLING = {
  validation: {
    recoveryOwner: "sender",
    clientAction: "stop-and-fix-input",
    guidance: "Fix the request or signed transaction before retrying.",
  },
  sender: {
    recoveryOwner: "sender",
    clientAction: "rebuild-signed-payment",
    guidance: "Build and sign a new payment after correcting sender nonce state.",
  },
  relay: {
    recoveryOwner: "relay",
    clientAction: "bounded-retry-same-payment",
    guidance: "Retry only with bounded relay-owned recovery against the same paymentId.",
  },
  settlement: {
    recoveryOwner: "relay",
    clientAction: "bounded-retry-same-payment",
    guidance: "Treat broadcast and settlement failures as relay-owned recovery on the same paymentId unless sender repair is explicitly required.",
  },
  replacement: {
    recoveryOwner: "caller",
    clientAction: "stop-polling-old-paymentId",
    guidance: "The old paymentId is terminal; stop polling it and decide the next action explicitly.",
  },
  identity: {
    recoveryOwner: "caller",
    clientAction: "restart-higher-level-flow-with-new-payment-identity",
    guidance: "The old identity is gone; restart the higher-level flow and never synthesize a replacement paymentId.",
  },
} as const satisfies Record<
  (typeof TERMINAL_REASON_CATEGORIES)[number],
  {
    recoveryOwner: string;
    clientAction: string;
    guidance: string;
  }
>;

export const TerminalReasonDetailSchema = z.object({
  reason: TerminalReasonSchema,
  category: TerminalReasonCategorySchema,
  terminalState: z.enum(["failed", "replaced", "not_found"]),
  code: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
});

export type FailedTerminalReason = z.infer<typeof FailedTerminalReasonSchema>;
export type ReplacedTerminalReason = z.infer<typeof ReplacedTerminalReasonSchema>;
export type NotFoundTerminalReason = z.infer<typeof NotFoundTerminalReasonSchema>;
export type TerminalReason = z.infer<typeof TerminalReasonSchema>;
export type TerminalReasonCategory = z.infer<typeof TerminalReasonCategorySchema>;
export type TerminalReasonDetail = z.infer<typeof TerminalReasonDetailSchema>;

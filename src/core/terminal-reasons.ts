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
  nonce_replacement: "replaced",
  superseded: "replaced",
  expired: "not_found",
  unknown_payment_identity: "not_found",
} as const;

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
  nonce_replacement: "replacement",
  superseded: "replacement",
  expired: "identity",
  unknown_payment_identity: "identity",
} as const satisfies Record<(typeof TERMINAL_REASONS)[number], (typeof TERMINAL_REASON_CATEGORIES)[number]>;

export const paymentTerminalReasonCategoryByReason = TERMINAL_REASON_TO_CATEGORY;

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

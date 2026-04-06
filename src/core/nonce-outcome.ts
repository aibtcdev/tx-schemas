import { z } from "zod";
import { StacksAddressSchema, AmountStringSchema } from "./primitives.js";
import { NonNegativeIntegerSchema, PositiveIntegerSchema } from "./primitives.js";

// ---------------------------------------------------------------------------
// Node broadcast outcomes — maps 1:1 to stacks-core MemPoolRejection variants
// ---------------------------------------------------------------------------

const AcceptedOutcomeSchema = z.object({
  outcome: z.literal("accepted"),
});

const NonceConflictOutcomeSchema = z.object({
  outcome: z.literal("nonce_conflict"),
  isOrigin: z.boolean(),
});

const ChainingLimitOutcomeSchema = z.object({
  outcome: z.literal("chaining_limit"),
  isOrigin: z.boolean(),
  maxNonce: NonNegativeIntegerSchema,
  actualNonce: NonNegativeIntegerSchema,
  principal: StacksAddressSchema,
});

const NonceTooLowOutcomeSchema = z.object({
  outcome: z.literal("nonce_too_low"),
});

const FeeTooLowOutcomeSchema = z.object({
  outcome: z.literal("fee_too_low"),
  required: AmountStringSchema,
  actual: AmountStringSchema,
});

const InsufficientFundsOutcomeSchema = z.object({
  outcome: z.literal("insufficient_funds"),
  required: AmountStringSchema,
  available: AmountStringSchema,
});

const InvalidTransactionOutcomeSchema = z.object({
  outcome: z.literal("invalid_transaction"),
  reason: z.string().min(1),
});

const RateLimitedOutcomeSchema = z.object({
  outcome: z.literal("rate_limited"),
});

const ServerErrorOutcomeSchema = z.object({
  outcome: z.literal("server_error"),
  reason: z.string().min(1),
});

const TemporarilyBlacklistedOutcomeSchema = z.object({
  outcome: z.literal("temporarily_blacklisted"),
});

export const NodeBroadcastOutcomeSchema = z.discriminatedUnion("outcome", [
  AcceptedOutcomeSchema,
  NonceConflictOutcomeSchema,
  ChainingLimitOutcomeSchema,
  NonceTooLowOutcomeSchema,
  FeeTooLowOutcomeSchema,
  InsufficientFundsOutcomeSchema,
  InvalidTransactionOutcomeSchema,
  RateLimitedOutcomeSchema,
  ServerErrorOutcomeSchema,
  TemporarilyBlacklistedOutcomeSchema,
]);

export type NodeBroadcastOutcome = z.infer<typeof NodeBroadcastOutcomeSchema>;

// ---------------------------------------------------------------------------
// Hiro polling outcomes — categorised transaction statuses from Hiro API
// ---------------------------------------------------------------------------

const HIRO_TERMINAL_STATUSES = [
  "abort_by_response",
  "abort_by_post_condition",
] as const;

const ConfirmedTxStatusSchema = z.object({
  category: z.literal("confirmed"),
  status: z.literal("success"),
  blockHeight: PositiveIntegerSchema,
});

const TerminalTxStatusSchema = z.object({
  category: z.literal("terminal"),
  status: z.enum(HIRO_TERMINAL_STATUSES),
});

const TransientTxStatusSchema = z.object({
  category: z.literal("transient"),
  status: z.string().min(1),
});

const NotFoundTxStatusSchema = z.object({
  category: z.literal("not_found"),
});

export const HiroTxStatusSchema = z.discriminatedUnion("category", [
  ConfirmedTxStatusSchema,
  TerminalTxStatusSchema,
  TransientTxStatusSchema,
  NotFoundTxStatusSchema,
]);

export type HiroTxStatus = z.infer<typeof HiroTxStatusSchema>;

// ---------------------------------------------------------------------------
// Broadcast responsibility — who should act on a given outcome
// ---------------------------------------------------------------------------

const SenderResponsibilitySchema = z.object({
  responsible: z.literal("sender"),
  action: z.literal("report_to_agent"),
  agentErrorCode: z.string().min(1),
});

const SponsorResponsibilitySchema = z.object({
  responsible: z.literal("sponsor"),
  action: z.enum(["skip_nonce", "wait_for_confirmations", "retry_with_higher_fee"]),
});

const NetworkResponsibilitySchema = z.object({
  responsible: z.literal("network"),
  action: z.literal("retry_after_delay"),
  retryAfterMs: PositiveIntegerSchema,
});

export const BroadcastResponsibilitySchema = z.discriminatedUnion("responsible", [
  SenderResponsibilitySchema,
  SponsorResponsibilitySchema,
  NetworkResponsibilitySchema,
]);

export type BroadcastResponsibility = z.infer<typeof BroadcastResponsibilitySchema>;

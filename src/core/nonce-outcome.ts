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
// Local broadcast failures — thrown by @stacks/transactions before any node call
// ---------------------------------------------------------------------------

const LocalFailureReasonSchema = z.string().min(1);

export const LocalBroadcastFailureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("auth_type_mismatch"), reason: LocalFailureReasonSchema }),
  z.object({ kind: z.literal("deserialize_failed"), reason: LocalFailureReasonSchema }),
  z.object({ kind: z.literal("malformed_bytes"), reason: LocalFailureReasonSchema }),
  z.object({ kind: z.literal("unknown_local"), reason: LocalFailureReasonSchema }),
]);

export type LocalBroadcastFailure = z.infer<typeof LocalBroadcastFailureSchema>;

/** A broadcast attempt either reached a node (`node`) or failed locally first (`local`). */
export const BroadcastAttemptOutcomeSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("node"), node: NodeBroadcastOutcomeSchema }),
  z.object({ source: z.literal("local"), local: LocalBroadcastFailureSchema }),
]);

export type BroadcastAttemptOutcome = z.infer<typeof BroadcastAttemptOutcomeSchema>;

/**
 * Message patterns per kind, measured against @stacks/transactions@7.3.1:
 * - sponsorTransaction on a standard tx: SigningError "Cannot sponsor sign a non-sponsored transaction"
 *   (and "Cannot add sponsor to non-sponsored transaction")
 * - deserializeTransaction("00"): DeserializationError "Could not parse undefined as AuthType";
 *   deserializeTransaction(""): Error "Could not parse undefined as TransactionVersion"
 * - deserializeTransaction("zz"): Error "Invalid byte sequence"
 * "failed to deserialize" / "malformed" are kept from the relay's existing catch block.
 */
export const LOCAL_BROADCAST_FAILURE_PATTERNS = {
  auth_type_mismatch: [/non-sponsored transaction/i],
  deserialize_failed: [/^Could not parse .+ as /, /failed to deserialize/i],
  malformed_bytes: [/invalid byte sequence/i, /malformed/i],
} as const satisfies Record<Exclude<LocalBroadcastFailure["kind"], "unknown_local">, readonly RegExp[]>;

/**
 * Classify an error thrown while building, signing or serializing a transaction.
 * Returns null for anything unrecognised so the caller's existing handling still applies.
 */
export function parseLocalBroadcastFailure(err: unknown): LocalBroadcastFailure | null {
  const reason = err instanceof Error ? err.message : String(err);
  if (!reason) return null;
  if (err instanceof Error && err.name === "DeserializationError") {
    return { kind: "deserialize_failed", reason };
  }
  for (const kind of ["auth_type_mismatch", "deserialize_failed", "malformed_bytes"] as const) {
    if (LOCAL_BROADCAST_FAILURE_PATTERNS[kind].some((re) => re.test(reason))) {
      return { kind, reason };
    }
  }
  return null;
}

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

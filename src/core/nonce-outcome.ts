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
// Exact wording of the errors @stacks/transactions 7.x and @stacks/common throw while building,
// signing or deserializing a transaction. Anchored so that unrelated errors that merely mention
// "malformed" or "deserialize" (an API response, a node 400 rethrown in the same try) never match.
const DECODED_ENUMS = "AddressHashMode|AnchorMode|AuthType|PostConditionMode|PubKeyEncoding|TransactionVersion";
export const LOCAL_BROADCAST_FAILURE_PATTERNS = {
  // SigningError from sponsorTransaction / TransactionSigner.signSponsor
  auth_type_mismatch: [/^Cannot (?:add sponsor to|sponsor sign a) non-sponsored transaction$/],
  // plain Error from the enum decoders used while deserializing transaction bytes
  deserialize_failed: [new RegExp(`^Could not parse \\S+ as (?:${DECODED_ENUMS})$`)],
  // plain Error from @stacks/common hexToBytes
  malformed_bytes: [/^Invalid byte sequence$/],
} as const satisfies Record<Exclude<LocalBroadcastFailure["kind"], "unknown_local">, readonly RegExp[]>;

/** Read `name` and `message` from anything error-shaped, including errors from another realm or a
 *  plain object that crossed a worker boundary. Never throws. */
function errorFields(err: unknown): { name: string; message: string } | null {
  try {
    if (typeof err === "string") return { name: "", message: err };
    if (err && typeof err === "object") {
      const e = err as { name?: unknown; message?: unknown };
      return {
        name: typeof e.name === "string" ? e.name : "",
        message: typeof e.message === "string" ? e.message : "",
      };
    }
  } catch {
    // a getter that throws: treat as unrecognised
  }
  return null;
}

/**
 * Classify an error thrown while building, signing or serializing a transaction LOCALLY
 * (`makeContractCall`, `sponsorTransaction`, `deserializeTransaction`, ...). Pass only errors from
 * those calls: node or API errors belong to `NodeBroadcastOutcome`. Returns null for anything
 * unrecognised, so the caller's existing handling still applies; `unknown_local` is for callers
 * that want to record such an error explicitly.
 */
export function parseLocalBroadcastFailure(err: unknown): LocalBroadcastFailure | null {
  const f = errorFields(err);
  if (!f) return null;
  // `reason` must be non-empty: fall back to the error name for an empty message.
  const reason = f.message || f.name;
  if (f.name === "DeserializationError") {
    return { kind: "deserialize_failed", reason: reason || "DeserializationError" };
  }
  if (!reason) return null;
  for (const kind of ["auth_type_mismatch", "deserialize_failed", "malformed_bytes"] as const) {
    if (LOCAL_BROADCAST_FAILURE_PATTERNS[kind].some((re) => re.test(f.message))) {
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

import { z } from "zod";
import { InFlightPaymentStateSchema, TrackedPaymentStateSchema } from "../core/enums.js";
import { TerminalReasonSchema } from "../core/terminal-reasons.js";
import {
  AmountStringSchema,
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  PaymentIdentifierSchema,
  PaymentIdSchema,
  PositiveIntegerSchema,
  StacksAddressSchema,
  TransactionHexSchema,
  TransactionIdSchema,
  UrlSchema,
} from "../core/primitives.js";
import { SponsorPoolStateSchema, WalletCapacitySchema } from "../core/wallet-capacity.js";
import { SenderQueueStateSchema } from "../core/sender-queue.js";

export const RPC_ERROR_CODES = [
  "INVALID_TRANSACTION",
  "NOT_SPONSORED",
  "SENDER_NONCE_STALE",
  "SENDER_NONCE_DUPLICATE",
  "SENDER_NONCE_GAP",
  "NONCE_CONFLICT",
  "SPONSOR_NONCE_STALE",
  "SPONSOR_NONCE_DUPLICATE",
  "BROADCAST_FAILED",
  "TX_BROADCAST_ERROR",
  "SETTLEMENT_FAILED",
  "INTERNAL_ERROR",
  "INSUFFICIENT_FUNDS",
  "CLIENT_NONCE_CONFLICT",
  "CLIENT_BAD_NONCE",
  "TOO_MUCH_CHAINING",
  "SPONSOR_EXHAUSTED",
  "ORIGIN_CHAINING_LIMIT",
  "BROADCAST_RATE_LIMITED",
  "SENDER_HAND_EXPIRED",
  "NONCE_OCCUPIED",
  "PAYMENT_IDENTIFIER_CONFLICT",
] as const;

export const RpcErrorCodeSchema = z.enum(RPC_ERROR_CODES);

export const RpcSettleOptionsSchema = z.object({
  expectedRecipient: StacksAddressSchema,
  minAmount: AmountStringSchema,
  tokenType: z.string().min(1).optional(),
  expectedSender: StacksAddressSchema.optional(),
  resource: z.string().min(1).optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  maxTimeoutSeconds: PositiveIntegerSchema.optional(),
});

export const RpcSenderNonceInfoSchema = z.object({
  provided: NonNegativeIntegerSchema,
  expected: NonNegativeIntegerSchema,
  healthy: z.boolean(),
  warning: z.string().optional(),
});

export const RpcSubmitPaymentWarningSchema = z.object({
  code: z.literal("SENDER_NONCE_GAP"),
  detail: z.string().min(1),
  senderNonce: z.object({
    provided: NonNegativeIntegerSchema,
    expected: NonNegativeIntegerSchema,
    lastSeen: NonNegativeIntegerSchema,
  }),
  help: z.string().min(1),
  action: z.string().min(1),
});

export const RpcSubmitPaymentRequestSchema = z.object({
  txHex: TransactionHexSchema,
  settle: RpcSettleOptionsSchema.optional(),
  // Caller-controlled idempotency key; see PaymentIdentifierSchema for charset/length constraints.
  paymentIdentifier: PaymentIdentifierSchema.optional(),
});

export const RpcSubmitPaymentAcceptedSchema = z.object({
  accepted: z.literal(true),
  paymentId: PaymentIdSchema,
  status: z.union([InFlightPaymentStateSchema, z.literal("queued_with_warning")]),
  senderNonce: RpcSenderNonceInfoSchema.optional(),
  warning: RpcSubmitPaymentWarningSchema.optional(),
  checkStatusUrl: UrlSchema.optional(),
});

export const RpcSubmitPaymentRejectedSchema = z.object({
  accepted: z.literal(false),
  error: z.string().min(1),
  code: RpcErrorCodeSchema.optional(),
  retryable: z.boolean().optional(),
  help: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  senderNonce: RpcSenderNonceInfoSchema.optional(),
});

export const RpcSubmitPaymentResultSchema = z.discriminatedUnion("accepted", [
  RpcSubmitPaymentAcceptedSchema,
  RpcSubmitPaymentRejectedSchema,
]);

export const RpcCheckPaymentRequestSchema = z.object({
  paymentId: PaymentIdSchema,
});

export const RpcCheckPaymentResultSchema = z.object({
  paymentId: PaymentIdSchema,
  status: TrackedPaymentStateSchema,
  txid: TransactionIdSchema.optional(),
  blockHeight: NonNegativeIntegerSchema.optional(),
  confirmedAt: z.string().datetime({ offset: true }).optional(),
  explorerUrl: UrlSchema.optional(),
  terminalReason: TerminalReasonSchema.optional(),
  error: z.string().min(1).optional(),
  errorCode: RpcErrorCodeSchema.optional(),
  retryable: z.boolean().optional(),
  senderNonceInfo: RpcSenderNonceInfoSchema.optional(),
  checkStatusUrl: UrlSchema.optional(),
});

export type RpcSubmitPaymentRequest = z.infer<typeof RpcSubmitPaymentRequestSchema>;
export type RpcSubmitPaymentResult = z.infer<typeof RpcSubmitPaymentResultSchema>;
export type RpcCheckPaymentRequest = z.infer<typeof RpcCheckPaymentRequestSchema>;
export type RpcCheckPaymentResult = z.infer<typeof RpcCheckPaymentResultSchema>;

// ---------------------------------------------------------------------------
// RPC wallet diagnostics — transport wrappers for Phase 4 core schemas
// ---------------------------------------------------------------------------

export const RpcWalletCapacitySchema = z.object({
  requestId: z.string().min(1),
  timestamp: IsoDateTimeSchema,
  wallet: WalletCapacitySchema,
});

export const RpcPoolStateSchema = z.object({
  requestId: z.string().min(1),
  timestamp: IsoDateTimeSchema,
  pool: SponsorPoolStateSchema,
});

export const RpcSenderQueueSummarySchema = z.object({
  requestId: z.string().min(1),
  timestamp: IsoDateTimeSchema,
  senderQueue: SenderQueueStateSchema,
});

export type RpcWalletCapacity = z.infer<typeof RpcWalletCapacitySchema>;
export type RpcPoolState = z.infer<typeof RpcPoolStateSchema>;
export type RpcSenderQueueSummary = z.infer<typeof RpcSenderQueueSummarySchema>;

/** @deprecated Use RpcSubmitPaymentResultSchema instead */
export const SubmitPaymentRpcResponseSchema = RpcSubmitPaymentResultSchema;
/** @deprecated Use RpcCheckPaymentResultSchema instead */
export const CheckPaymentRpcResponseSchema = RpcCheckPaymentResultSchema;

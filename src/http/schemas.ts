import { z } from "zod";
import { TrackedPaymentStateSchema } from "../core/enums.js";
import { TerminalReasonSchema } from "../core/terminal-reasons.js";
import {
  AmountStringSchema,
  NonNegativeIntegerSchema,
  PaymentIdSchema,
  PositiveIntegerSchema,
  StacksAddressSchema,
  TransactionHexSchema,
  TransactionIdSchema,
  UrlSchema,
} from "../core/primitives.js";

export const HTTP_SETTLE_ERROR_REASONS = [
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_network",
  "unrecognized_asset",
  "invalid_transaction_state",
  "recipient_mismatch",
  "amount_insufficient",
  "sender_mismatch",
  "broadcast_failed",
  "transaction_failed",
  "unexpected_settle_error",
  "payment_identifier_conflict",
] as const;

export const HttpSettleErrorReasonSchema = z.enum(HTTP_SETTLE_ERROR_REASONS);

export const HttpPaymentIdentifierExtensionSchema = z.object({
  info: z.object({
    id: PaymentIdSchema,
  }),
});

export const HttpPaymentPayloadSchema = z.object({
  x402Version: z.number().int().positive().optional(),
  accepted: z
    .object({
      scheme: z.string().min(1),
      network: z.string().min(1),
      amount: AmountStringSchema,
      asset: z.string().min(1),
      payTo: StacksAddressSchema,
      maxTimeoutSeconds: PositiveIntegerSchema.optional(),
    })
    .optional(),
  resource: z
    .object({
      url: UrlSchema,
      description: z.string().min(1).optional(),
      mimeType: z.string().min(1).optional(),
    })
    .optional(),
  payload: z.object({
    transaction: TransactionHexSchema,
  }),
  extensions: z
    .object({
      "payment-identifier": HttpPaymentIdentifierExtensionSchema.optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const HttpPaymentRequirementSchema = z.object({
  scheme: z.literal("exact").default("exact"),
  network: z.string().min(1),
  amount: AmountStringSchema,
  asset: z.string().min(1),
  payTo: StacksAddressSchema,
  maxTimeoutSeconds: PositiveIntegerSchema.optional(),
  description: z.string().min(1).optional(),
});

export const HttpPaymentRequiredSchema = z.object({
  x402Version: z.number().int().positive(),
  error: z.string().min(1).optional(),
  resource: z.object({
    url: UrlSchema,
    description: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
  }),
  accepts: z.array(HttpPaymentRequirementSchema).min(1),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const HttpPaymentRequiredBodySchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  x402: HttpPaymentRequiredSchema,
});

export const HttpSettleRequestSchema = z.object({
  x402Version: z.number().int().positive().optional(),
  paymentPayload: HttpPaymentPayloadSchema,
  paymentRequirements: HttpPaymentRequirementSchema,
});

export const HttpQueueInfoSchema = z.object({
  status: z.literal("held"),
  senderNonce: NonNegativeIntegerSchema,
  nextExpectedNonce: NonNegativeIntegerSchema,
  missingNonces: z.array(NonNegativeIntegerSchema),
  handSize: NonNegativeIntegerSchema,
  estimatedDispatchMs: NonNegativeIntegerSchema.nullable(),
  expiresAt: z.string().datetime({ offset: true }),
  help: z.string().min(1),
  recentlyExpired: z
    .object({
      nonces: z.array(NonNegativeIntegerSchema),
      expiredAt: z.string().datetime({ offset: true }),
    })
    .optional(),
});

export const HttpSettleSuccessResponseSchema = z.object({
  success: z.literal(true),
  transaction: TransactionIdSchema,
  network: z.string().min(1),
  payer: StacksAddressSchema.optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const HttpSettleFailureResponseSchema = z.object({
  success: z.literal(false),
  errorReason: HttpSettleErrorReasonSchema,
  transaction: z.string(),
  network: z.string().min(1),
  payer: StacksAddressSchema.optional(),
  queue: HttpQueueInfoSchema.optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const HttpSettleResponseSchema = z.discriminatedUnion("success", [
  HttpSettleSuccessResponseSchema,
  HttpSettleFailureResponseSchema,
]);

export const HttpVerifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z
    .enum([
      "invalid_payload",
      "invalid_payment_requirements",
      "invalid_network",
      "unrecognized_asset",
      "invalid_transaction_state",
      "recipient_mismatch",
      "amount_insufficient",
      "sender_mismatch",
    ])
    .optional(),
  payer: StacksAddressSchema.optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const HttpSupportedKindSchema = z.object({
  x402Version: z.number().int().positive(),
  scheme: z.string().min(1),
  network: z.string().min(1),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const HttpSupportedResponseSchema = z.object({
  kinds: z.array(HttpSupportedKindSchema),
  extensions: z.array(z.string().min(1)),
  signers: z.record(z.string(), z.array(StacksAddressSchema)),
});

export const HttpPaymentStatusResponseSchema = z.object({
  paymentId: PaymentIdSchema,
  status: TrackedPaymentStateSchema,
  txid: TransactionIdSchema.optional(),
  blockHeight: NonNegativeIntegerSchema.optional(),
  confirmedAt: z.string().datetime({ offset: true }).optional(),
  explorerUrl: UrlSchema.optional(),
  terminalReason: TerminalReasonSchema.optional(),
  error: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  checkStatusUrl: z.string().min(1).optional(),
});

export const HttpErrorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  hint: z.string().min(1).optional(),
});

export type HttpSettleRequest = z.infer<typeof HttpSettleRequestSchema>;
export type HttpSettleResponse = z.infer<typeof HttpSettleResponseSchema>;
export type HttpVerifyResponse = z.infer<typeof HttpVerifyResponseSchema>;
export type HttpSupportedResponse = z.infer<typeof HttpSupportedResponseSchema>;
export type HttpPaymentStatusResponse = z.infer<typeof HttpPaymentStatusResponseSchema>;
export type HttpErrorResponse = z.infer<typeof HttpErrorResponseSchema>;

export const SettleHttpRequestSchema = HttpSettleRequestSchema;
export const SettleHttpResponseSchema = HttpSettleResponseSchema;
export const VerifyHttpResponseSchema = HttpVerifyResponseSchema;
export const SupportedHttpResponseSchema = HttpSupportedResponseSchema;
export const PaymentStatusHttpResponseSchema = HttpPaymentStatusResponseSchema;

import { z } from "zod";
import {
  InFlightPaymentStateSchema,
  PAYMENT_STATE_TO_CATEGORY,
  PaymentStateCategorySchema,
  PaymentStateSchema,
} from "./enums.js";
import {
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  PaymentIdSchema,
  TransactionIdSchema,
  UrlSchema,
} from "./primitives.js";
import {
  FailedTerminalReasonSchema,
  NotFoundTerminalReasonSchema,
  ReplacedTerminalReasonSchema,
} from "./terminal-reasons.js";

const PaymentStatusBaseSchema = z.object({
  state: PaymentStateSchema,
  category: PaymentStateCategorySchema,
});

function inFlightStatusSchema(state: z.infer<typeof InFlightPaymentStateSchema>) {
  return PaymentStatusBaseSchema.extend({
    state: z.literal(state),
    category: z.literal(PAYMENT_STATE_TO_CATEGORY[state]),
    paymentId: PaymentIdSchema,
    txid: TransactionIdSchema.optional(),
  });
}

export const RequiresPaymentStatusSchema = PaymentStatusBaseSchema.extend({
  state: z.literal("requires_payment"),
  category: z.literal(PAYMENT_STATE_TO_CATEGORY.requires_payment),
});

export const SubmittedPaymentStatusSchema = inFlightStatusSchema("submitted");
export const QueuedPaymentStatusSchema = inFlightStatusSchema("queued");
export const BroadcastingPaymentStatusSchema = inFlightStatusSchema("broadcasting");
export const MempoolPaymentStatusSchema = inFlightStatusSchema("mempool");

export const ConfirmedPaymentStatusSchema = PaymentStatusBaseSchema.extend({
  state: z.literal("confirmed"),
  category: z.literal(PAYMENT_STATE_TO_CATEGORY.confirmed),
  paymentId: PaymentIdSchema,
  txid: TransactionIdSchema.optional(),
  blockHeight: NonNegativeIntegerSchema.optional(),
  confirmedAt: IsoDateTimeSchema.optional(),
  explorerUrl: UrlSchema.optional(),
});

export const FailedPaymentStatusSchema = PaymentStatusBaseSchema.extend({
  state: z.literal("failed"),
  category: z.literal(PAYMENT_STATE_TO_CATEGORY.failed),
  paymentId: PaymentIdSchema,
  txid: TransactionIdSchema.optional(),
  reason: FailedTerminalReasonSchema,
  detail: z.string().optional(),
  retryable: z.boolean().optional(),
});

export const ReplacedPaymentStatusSchema = PaymentStatusBaseSchema.extend({
  state: z.literal("replaced"),
  category: z.literal(PAYMENT_STATE_TO_CATEGORY.replaced),
  paymentId: PaymentIdSchema,
  txid: TransactionIdSchema.optional(),
  reason: ReplacedTerminalReasonSchema,
  detail: z.string().optional(),
});

export const NotFoundPaymentStatusSchema = PaymentStatusBaseSchema.extend({
  state: z.literal("not_found"),
  category: z.literal(PAYMENT_STATE_TO_CATEGORY.not_found),
  paymentId: PaymentIdSchema,
  reason: NotFoundTerminalReasonSchema,
  detail: z.string().optional(),
});

export const PaymentStatusSchema = z.discriminatedUnion("state", [
  RequiresPaymentStatusSchema,
  SubmittedPaymentStatusSchema,
  QueuedPaymentStatusSchema,
  BroadcastingPaymentStatusSchema,
  MempoolPaymentStatusSchema,
  ConfirmedPaymentStatusSchema,
  FailedPaymentStatusSchema,
  ReplacedPaymentStatusSchema,
  NotFoundPaymentStatusSchema,
]);

export const TrackedPaymentStatusSchema = z.discriminatedUnion("state", [
  SubmittedPaymentStatusSchema,
  QueuedPaymentStatusSchema,
  BroadcastingPaymentStatusSchema,
  MempoolPaymentStatusSchema,
  ConfirmedPaymentStatusSchema,
  FailedPaymentStatusSchema,
  ReplacedPaymentStatusSchema,
  NotFoundPaymentStatusSchema,
]);

export const TerminalPaymentStatusSchema = z.discriminatedUnion("state", [
  ConfirmedPaymentStatusSchema,
  FailedPaymentStatusSchema,
  ReplacedPaymentStatusSchema,
  NotFoundPaymentStatusSchema,
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type TrackedPaymentStatus = z.infer<typeof TrackedPaymentStatusSchema>;
export type TerminalPaymentStatus = z.infer<typeof TerminalPaymentStatusSchema>;

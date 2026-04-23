import { z } from "zod";

export const AmountStringSchema = z
  .string()
  .regex(/^[0-9]+$/, "Expected an integer amount string");

export const PaymentIdSchema = z
  .string()
  .regex(/^pay_[A-Za-z0-9_-]+$/, "Expected a relay payment id with a pay_ prefix");

export const TransactionHexSchema = z
  .string()
  .regex(/^(?:0x)?[0-9a-fA-F]+$/, "Expected hex-encoded transaction data");

export const TransactionIdSchema = z
  .string()
  .regex(/^(?:0x)?[0-9a-fA-F]{64}$/, "Expected a 32-byte transaction id");

export const StacksAddressSchema = z
  .string()
  .min(1, "Expected a Stacks address");

export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true });

export const PositiveIntegerSchema = z
  .number()
  .int()
  .positive();

export const NonNegativeIntegerSchema = z
  .number()
  .int()
  .nonnegative();

export const UrlSchema = z.string().url();

// Caller-controlled idempotency key for x402 V2 payment-identifier extension.
// Charset and length match the V2 spec: [a-zA-Z0-9_-]{16,128}.
// Distinct from PaymentIdSchema (relay-assigned, pay_ prefix); this is caller-provided.
export const PaymentIdentifierSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]{16,128}$/,
    "Expected a caller-provided payment identifier: [a-zA-Z0-9_-]{16,128}",
  );

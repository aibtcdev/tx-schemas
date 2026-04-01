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

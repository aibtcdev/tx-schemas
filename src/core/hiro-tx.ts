import { z } from "zod";
import {
  AmountStringSchema,
  NonNegativeIntegerSchema,
  StacksAddressSchema,
  TransactionIdSchema,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Hiro mempool/tx view — minimal shape the sponsor wallet helpers read.
//
// Structurally compatible with the `Transaction` and `MempoolTransaction`
// payloads returned by the Hiro Stacks Blockchain API
// (@stacks/blockchain-api-client). Consumers may pass the raw Hiro response
// directly; extra fields are preserved.
// ---------------------------------------------------------------------------

export const HiroSponsorTxViewSchema = z
  .object({
    tx_id: TransactionIdSchema,
    sender_address: StacksAddressSchema,
    sponsored: z.boolean(),
    sponsor_address: StacksAddressSchema.optional(),
    nonce: NonNegativeIntegerSchema.optional(),
    sponsor_nonce: NonNegativeIntegerSchema.optional(),
    fee_rate: AmountStringSchema.optional(),
  })
  .passthrough();

export type HiroSponsorTxView = z.infer<typeof HiroSponsorTxViewSchema>;

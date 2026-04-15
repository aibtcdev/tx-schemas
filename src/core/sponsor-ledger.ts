import { z } from "zod";
import { NodeBroadcastOutcomeSchema } from "./nonce-outcome.js";
import {
  AmountStringSchema,
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  StacksAddressSchema,
  TransactionIdSchema,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Sponsor ledger — local record of what this sponsor has broadcast.
//
// One entry per (sponsorAddress, nonce). Relays persist this so they can
// distinguish their own prior broadcast (RBF path) from a foreign occupant
// (quarantine path) when stacks-core reports a nonce conflict.
//
// Lifecycle (two-phase broadcast):
//   (no entry)        → pending_broadcast       [beginPendingBroadcast]
//   pending_broadcast → broadcast_sent          [resolveBroadcast / reconcile]
//   pending_broadcast → broadcast_failed        [resolveBroadcast]
//   broadcast_sent    → pending_broadcast       [new RBF attempt, new txId]
//   broadcast_failed  → pending_broadcast       [retry, new txId]
// ---------------------------------------------------------------------------

export const LedgerEntryStatusSchema = z.enum([
  "pending_broadcast",
  "broadcast_sent",
  "broadcast_failed",
]);

export type LedgerEntryStatus = z.infer<typeof LedgerEntryStatusSchema>;

export const SponsorLedgerEntrySchema = z.object({
  nonce: NonNegativeIntegerSchema,
  txId: TransactionIdSchema,
  fee: AmountStringSchema,
  status: LedgerEntryStatusSchema,
  broadcastAt: IsoDateTimeSchema,
  rbfAttempts: NonNegativeIntegerSchema,
  lastOutcome: NodeBroadcastOutcomeSchema.optional(),
});

export type SponsorLedgerEntry = z.infer<typeof SponsorLedgerEntrySchema>;

export const SponsorLedgerSchema = z
  .object({
    sponsorAddress: StacksAddressSchema,
    entries: z.record(
      z.string().regex(/^[0-9]+$/, "ledger keys must be integer nonce strings"),
      SponsorLedgerEntrySchema
    ),
  })
  .superRefine((ledger, ctx) => {
    for (const [key, entry] of Object.entries(ledger.entries)) {
      if (Number(key) !== entry.nonce) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", key, "nonce"],
          message: `ledger entry nonce ${entry.nonce} does not match record key ${key}`,
        });
      }
    }
  });

export type SponsorLedger = z.infer<typeof SponsorLedgerSchema>;

export const getLedgerEntry = (
  ledger: SponsorLedger,
  nonce: number
): SponsorLedgerEntry | undefined => ledger.entries[String(nonce)];

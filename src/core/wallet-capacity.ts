import { z } from "zod";
import {
  AmountStringSchema,
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  StacksAddressSchema,
  TransactionIdSchema,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Last occupant metadata — snapshot of a conflicting tx at a sponsor nonce.
// ---------------------------------------------------------------------------

export const LastOccupantSchema = z.object({
  txId: TransactionIdSchema.optional(),
  address: StacksAddressSchema.optional(),
  fee: AmountStringSchema.optional(),
  observedAt: IsoDateTimeSchema.optional(),
});

export type LastOccupant = z.infer<typeof LastOccupantSchema>;

// ---------------------------------------------------------------------------
// Occupied nonce — per-nonce conflict tracking (replaces ghost_degraded)
// ---------------------------------------------------------------------------

export const OccupiedNonceSchema = z
  .object({
    nonce: NonNegativeIntegerSchema,
    conflictedAt: IsoDateTimeSchema,
    occupantVisible: z.boolean(),
    rbfAttempts: NonNegativeIntegerSchema,
    maxRbfAttempts: NonNegativeIntegerSchema,
    abandonAfter: IsoDateTimeSchema,
    lastOccupant: LastOccupantSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rbfAttempts > value.maxRbfAttempts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rbfAttempts"],
        message: `rbfAttempts must be less than or equal to maxRbfAttempts (${value.maxRbfAttempts})`,
      });
    }
  });

export type OccupiedNonce = z.infer<typeof OccupiedNonceSchema>;

// ---------------------------------------------------------------------------
// Quarantined nonce — slot permanently skipped (foreign occupant, max RBF,
// ghost timeout). Surfaced separately from occupiedNonces so the relay can
// advance `possibleNextNonce` past them without re-attempting RBF.
// ---------------------------------------------------------------------------

export const QUARANTINE_REASONS = [
  "foreign_occupant",
  "rbf_max_attempts",
  "untraceable",
] as const;

export const QuarantineReasonSchema = z.enum(QUARANTINE_REASONS);
export type QuarantineReason = z.infer<typeof QuarantineReasonSchema>;

export const QuarantinedNonceSchema = z.object({
  nonce: NonNegativeIntegerSchema,
  reason: QuarantineReasonSchema,
  quarantinedAt: IsoDateTimeSchema,
  lastOccupant: LastOccupantSchema.optional(),
});

export type QuarantinedNonce = z.infer<typeof QuarantinedNonceSchema>;

// ---------------------------------------------------------------------------
// Wallet capacity — derived from nonce math, no sticky flags
// ---------------------------------------------------------------------------

export const WalletCapacitySchema = z
  .object({
    walletIndex: NonNegativeIntegerSchema,
    sponsorAddress: StacksAddressSchema,

    // Nonce bookkeeping
    chainFrontier: NonNegativeIntegerSchema,
    assignmentHead: NonNegativeIntegerSchema,
    inFlightCount: NonNegativeIntegerSchema,

    // Capacity (simple math)
    chainingLimit: PositiveIntegerSchema,
    available: NonNegativeIntegerSchema,

    // Per-nonce conflict tracking
    occupiedNonces: z.array(OccupiedNonceSchema),

    // Recent outcome history (replaces circuit breaker)
    recentFailures: NonNegativeIntegerSchema,
    recentFailureWindow: PositiveIntegerSchema,

    // Quarantined slots + the next nonce the relay should assign from.
    // Optional for back-compat — consumers treat `undefined` as `[]` and
    // `assignmentHead` respectively; helpers in sponsor-wallet-machine
    // materialise concrete values on first write.
    quarantinedNonces: z.array(QuarantinedNonceSchema).optional(),
    possibleNextNonce: NonNegativeIntegerSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.inFlightCount > value.chainingLimit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inFlightCount"],
        message: "inFlightCount must be less than or equal to chainingLimit",
      });
    }

    const expectedAvailable = value.chainingLimit - value.inFlightCount;
    if (value.available !== expectedAvailable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["available"],
        message: `available must equal chainingLimit - inFlightCount (${expectedAvailable})`,
      });
    }

    const nonceSet = new Set(value.occupiedNonces.map((n) => n.nonce));
    if (nonceSet.size !== value.occupiedNonces.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occupiedNonces"],
        message: "occupiedNonces must not contain duplicate nonce values",
      });
    }

    if (value.quarantinedNonces) {
      const quarantineSet = new Set(value.quarantinedNonces.map((n) => n.nonce));
      if (quarantineSet.size !== value.quarantinedNonces.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quarantinedNonces"],
          message: "quarantinedNonces must not contain duplicate nonce values",
        });
      }
    }

    if (
      value.possibleNextNonce !== undefined &&
      value.possibleNextNonce < value.assignmentHead
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["possibleNextNonce"],
        message: `possibleNextNonce must be >= assignmentHead (${value.assignmentHead})`,
      });
    }
  });

export type WalletCapacity = z.infer<typeof WalletCapacitySchema>;

// ---------------------------------------------------------------------------
// Sponsor pool state — aggregate across all wallets
// ---------------------------------------------------------------------------

export const SponsorPoolStateSchema = z
  .object({
    walletCount: NonNegativeIntegerSchema,
    wallets: z.array(WalletCapacitySchema),
    totalAvailable: NonNegativeIntegerSchema,
    totalInFlight: NonNegativeIntegerSchema,
    totalCapacity: NonNegativeIntegerSchema,
    lastReconciliationAt: IsoDateTimeSchema,
    lastGapDetected: IsoDateTimeSchema.optional(),
    gapsFilled: NonNegativeIntegerSchema,
  })
  .superRefine((state, ctx) => {
    if (state.walletCount !== state.wallets.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["walletCount"],
        message: `walletCount must equal wallets.length (${state.wallets.length})`,
      });
    }

    const computedTotalAvailable = state.wallets.reduce(
      (sum, wallet) => sum + wallet.available,
      0
    );
    if (state.totalAvailable !== computedTotalAvailable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalAvailable"],
        message: `totalAvailable must equal the sum of wallets[].available (${computedTotalAvailable})`,
      });
    }

    const computedTotalInFlight = state.wallets.reduce(
      (sum, wallet) => sum + wallet.inFlightCount,
      0
    );
    if (state.totalInFlight !== computedTotalInFlight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalInFlight"],
        message: `totalInFlight must equal the sum of wallets[].inFlightCount (${computedTotalInFlight})`,
      });
    }

    const computedTotalCapacity = state.wallets.reduce(
      (sum, wallet) => sum + wallet.chainingLimit,
      0
    );
    if (state.totalCapacity !== computedTotalCapacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalCapacity"],
        message: `totalCapacity must equal the sum of wallets[].chainingLimit (${computedTotalCapacity})`,
      });
    }
  });

export type SponsorPoolState = z.infer<typeof SponsorPoolStateSchema>;

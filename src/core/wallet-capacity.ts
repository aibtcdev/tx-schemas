import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  StacksAddressSchema,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Occupied nonce — per-nonce conflict tracking (replaces ghost_degraded)
// ---------------------------------------------------------------------------

export const OccupiedNonceSchema = z.object({
  nonce: NonNegativeIntegerSchema,
  conflictedAt: IsoDateTimeSchema,
  occupantVisible: z.boolean(),
  rbfAttempts: NonNegativeIntegerSchema,
  maxRbfAttempts: NonNegativeIntegerSchema,
  abandonAfter: IsoDateTimeSchema,
});

export type OccupiedNonce = z.infer<typeof OccupiedNonceSchema>;

// ---------------------------------------------------------------------------
// Wallet capacity — derived from nonce math, no sticky flags
// ---------------------------------------------------------------------------

export const WalletCapacitySchema = z.object({
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
});

export type WalletCapacity = z.infer<typeof WalletCapacitySchema>;

// ---------------------------------------------------------------------------
// Sponsor pool state — aggregate across all wallets
// ---------------------------------------------------------------------------

export const SponsorPoolStateSchema = z.object({
  walletCount: NonNegativeIntegerSchema,
  wallets: z.array(WalletCapacitySchema),
  totalAvailable: NonNegativeIntegerSchema,
  totalInFlight: NonNegativeIntegerSchema,
  totalCapacity: NonNegativeIntegerSchema,
  lastReconciliationAt: IsoDateTimeSchema,
  lastGapDetected: IsoDateTimeSchema.optional(),
  gapsFilled: NonNegativeIntegerSchema,
});

export type SponsorPoolState = z.infer<typeof SponsorPoolStateSchema>;

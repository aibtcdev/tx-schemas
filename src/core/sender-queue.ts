import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  StacksAddressSchema,
} from "./primitives.js";

// ---------------------------------------------------------------------------
// Sender frontier — nonce tracking for a sender address
// ---------------------------------------------------------------------------

const FRONTIER_SEED_SOURCES = ["hiro", "transaction", "manual"] as const;
const FRONTIER_HEALTH_STATES = ["current", "stale", "divergent"] as const;

const SenderFrontierBaseSchema = z.object({
  address: StacksAddressSchema,
  nextExpectedNonce: NonNegativeIntegerSchema,
  seededFrom: z.enum(FRONTIER_SEED_SOURCES),
  lastRefreshAt: IsoDateTimeSchema.nullable(),
});

const CurrentSenderFrontierSchema = SenderFrontierBaseSchema.extend({
  frontierHealth: z.literal("current"),
});

const StaleSenderFrontierSchema = SenderFrontierBaseSchema.extend({
  frontierHealth: z.literal("stale"),
  staleSince: IsoDateTimeSchema,
});

const DivergentSenderFrontierSchema = SenderFrontierBaseSchema.extend({
  frontierHealth: z.literal("divergent"),
});

export const SenderFrontierSchema = z.discriminatedUnion("frontierHealth", [
  CurrentSenderFrontierSchema,
  StaleSenderFrontierSchema,
  DivergentSenderFrontierSchema,
]);

export type SenderFrontier = z.infer<typeof SenderFrontierSchema>;

// ---------------------------------------------------------------------------
// Sender queue entry — individual held transaction
// ---------------------------------------------------------------------------

const QUEUE_ENTRY_STATES = ["held", "ready", "dispatching", "expired"] as const;

export const SenderQueueEntrySchema = z.object({
  senderNonce: NonNegativeIntegerSchema,
  insertedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  state: z.enum(QUEUE_ENTRY_STATES),
  expiryNotified: z.boolean(),
});

export type SenderQueueEntry = z.infer<typeof SenderQueueEntrySchema>;

// ---------------------------------------------------------------------------
// Per-sender queue state — discriminated union on queueState
// ---------------------------------------------------------------------------

const EmptySenderQueueSchema = z.object({
  queueState: z.literal("empty"),
  frontier: SenderFrontierSchema,
});

const ReadySenderQueueSchema = z.object({
  queueState: z.literal("ready"),
  frontier: SenderFrontierSchema,
  entries: z.array(SenderQueueEntrySchema),
  gaplessRunLength: NonNegativeIntegerSchema,
});

const HeldSenderQueueSchema = z.object({
  queueState: z.literal("held"),
  frontier: SenderFrontierSchema,
  entries: z.array(SenderQueueEntrySchema),
  missingNonces: z.array(NonNegativeIntegerSchema),
});

const DispatchingSenderQueueSchema = z.object({
  queueState: z.literal("dispatching"),
  frontier: SenderFrontierSchema,
  dispatchedEntries: z.array(SenderQueueEntrySchema),
});

const ExpiredSenderQueueSchema = z.object({
  queueState: z.literal("expired"),
  frontier: SenderFrontierSchema,
  expiredEntries: z.array(SenderQueueEntrySchema),
  expiredNonces: z.array(NonNegativeIntegerSchema),
});

export const SenderQueueStateSchema = z.discriminatedUnion("queueState", [
  EmptySenderQueueSchema,
  ReadySenderQueueSchema,
  HeldSenderQueueSchema,
  DispatchingSenderQueueSchema,
  ExpiredSenderQueueSchema,
]);

export type SenderQueueState = z.infer<typeof SenderQueueStateSchema>;

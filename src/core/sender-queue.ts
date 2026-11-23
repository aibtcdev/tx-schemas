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

// Extract the fractional-second digits of an ISO timestamp ("" when absent).
function fractionalSeconds(iso: string): string {
  const match = iso.match(/\.(\d+)/);
  return match?.[1] ?? "";
}

// Compare two fractional-second strings as decimal fractions (0.xxxx).
function compareFractionalSeconds(a: string, b: string): number {
  const fa = fractionalSeconds(a);
  const fb = fractionalSeconds(b);
  const len = Math.max(fa.length, fb.length);
  const pa = fa.padEnd(len, "0");
  const pb = fb.padEnd(len, "0");
  if (pa === pb) return 0;
  return pa > pb ? 1 : -1;
}

export const SenderQueueEntrySchema = z
  .object({
    senderNonce: NonNegativeIntegerSchema,
    insertedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    state: z.enum(QUEUE_ENTRY_STATES),
    expiryNotified: z.boolean(),
  })
  .superRefine((entry, ctx) => {
    const insertedMs = Date.parse(entry.insertedAt);
    const expiresMs = Date.parse(entry.expiresAt);
    if (Number.isNaN(insertedMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["insertedAt"],
        message: "insertedAt must be a parseable timestamp",
      });
      return;
    }
    if (Number.isNaN(expiresMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be a parseable timestamp",
      });
      return;
    }
    // Date.parse truncates to milliseconds while IsoDateTimeSchema accepts
    // arbitrary fractional-second digits, so break millisecond ties on the
    // raw fraction (timezone offsets carry no sub-minute component, so the
    // local fraction equals the instant's fraction).
    let expiresAfter = expiresMs > insertedMs;
    if (expiresMs === insertedMs) {
      expiresAfter = compareFractionalSeconds(entry.expiresAt, entry.insertedAt) > 0;
    }
    if (!expiresAfter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be after insertedAt",
      });
    }
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

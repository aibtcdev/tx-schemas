import { z } from "zod";
import type { BroadcastResponsibility } from "./nonce-outcome.js";
import { NodeBroadcastOutcomeSchema } from "./nonce-outcome.js";
import type { NodeBroadcastOutcome } from "./nonce-outcome.js";

// ---------------------------------------------------------------------------
// Local (pre-broadcast) failure classification — issue #32, Option B
//
// Canonical error strings sourced from @stacks/transactions broadcast path
// (observed in x402-sponsor-relay nonce-do bounded_broadcast catch blocks).
// Pinned against @stacks/transactions 7.x; re-verify on package upgrades.
// ---------------------------------------------------------------------------

export const LOCAL_BROADCAST_CANONICAL_STRINGS = {
  /** "Cannot sponsor sign a non-sponsored transaction" */
  authTypeMismatch: /non-sponsored transaction/i,
  /** "Failed to deserialize transaction" (malformed hex input) */
  deserializeFailed: /failed to deserialize/i,
  /** "malformed" byte-length / structure assertions */
  malformedBytes: /malformed/i,
} as const;

export const LocalBroadcastFailureSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("auth_type_mismatch"), reason: z.string() }),
  z.object({ kind: z.literal("deserialize_failed"), reason: z.string() }),
  z.object({ kind: z.literal("malformed_bytes"), reason: z.string() }),
  z.object({ kind: z.literal("unknown_local"), reason: z.string() }),
]);

export type LocalBroadcastFailure = z.infer<typeof LocalBroadcastFailureSchema>;

/**
 * Classify a caught pre-broadcast error. Always returns a
 * LocalBroadcastFailure — unrecognized shapes become `unknown_local` so
 * callers route them to triage instead of silently falling through
 * generic catch blocks (maintainer refinement on #32).
 */
export function parseLocalBroadcastFailure(err: unknown): LocalBroadcastFailure {
  const reason = err instanceof Error ? err.message : String(err);
  if (LOCAL_BROADCAST_CANONICAL_STRINGS.authTypeMismatch.test(reason)) {
    return { kind: "auth_type_mismatch", reason };
  }
  if (LOCAL_BROADCAST_CANONICAL_STRINGS.deserializeFailed.test(reason)) {
    return { kind: "deserialize_failed", reason };
  }
  if (LOCAL_BROADCAST_CANONICAL_STRINGS.malformedBytes.test(reason)) {
    return { kind: "malformed_bytes", reason };
  }
  return { kind: "unknown_local", reason };
}

// ---------------------------------------------------------------------------
// BroadcastAttemptOutcome — node response OR local failure, tagged by source
// ---------------------------------------------------------------------------

export const BroadcastAttemptOutcomeSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("node"), node: NodeBroadcastOutcomeSchema }),
  z.object({ source: z.literal("local"), local: LocalBroadcastFailureSchema }),
]);

export type BroadcastAttemptOutcome = z.infer<typeof BroadcastAttemptOutcomeSchema>;

// ---------------------------------------------------------------------------
// Responsibility mapping for local failures (additive — does not touch the
// relay's decideBroadcastAction for node outcomes)
// ---------------------------------------------------------------------------

/**
 * Map a LocalBroadcastFailure to a BroadcastResponsibility.
 * Structural tx-content failures retire (the hex is broken, not the world);
 * unknown_local alerts for review so new @stacks/transactions failure
 * shapes surface instead of being silently retired.
 */
export function decideLocalBroadcastFailure(
  local: LocalBroadcastFailure
): BroadcastResponsibility {
  switch (local.kind) {
    case "auth_type_mismatch":
    case "deserialize_failed":
    case "malformed_bytes":
      return { responsible: "relay", action: "retire" };
    case "unknown_local":
      return { responsible: "relay", action: "alert_for_review" };
  }
}

export type { NodeBroadcastOutcome };

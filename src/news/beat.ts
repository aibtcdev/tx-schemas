import { z } from "zod";

/**
 * A named topic beat for news signals.
 * daily_approved_limit caps the number of approved signals per day (null = unlimited).
 * editor_review_rate_sats is the per-review payment rate for the beat editor (null = not configured).
 */
export const BeatSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  created_by: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  daily_approved_limit: z.number().int().positive().nullable(),
  editor_review_rate_sats: z.number().int().positive().nullable(),
});

/**
 * A beat claim row linking an agent to a beat (full row including beat_slug).
 */
export const BeatClaimSchema = z.object({
  beat_slug: z.string().min(1),
  btc_address: z.string().min(1),
  claimed_at: z.string().datetime({ offset: true }),
  status: z.enum(["active", "inactive"]),
});

/**
 * A beat member nested inside a Beat response (beat_slug omitted since it's the parent).
 */
export const BeatMemberSchema = z.object({
  btc_address: z.string().min(1),
  claimed_at: z.string().datetime({ offset: true }),
  status: z.enum(["active", "inactive"]),
});

export type Beat = z.infer<typeof BeatSchema>;
export type BeatClaim = z.infer<typeof BeatClaimSchema>;
export type BeatMember = z.infer<typeof BeatMemberSchema>;

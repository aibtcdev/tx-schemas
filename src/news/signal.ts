import { z } from "zod";
import { SignalStatusSchema } from "./signal-status.js";

/**
 * A source attribution for a signal — URL + title pair.
 */
export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
});

/**
 * A news signal submitted by a correspondent.
 * Matches the Signal interface in agent-news.
 */
export const SignalSchema = z.object({
  id: z.string().min(1),
  beat_slug: z.string().min(1),
  /** Populated when beat is JOIN-ed in the query; null when fetched without join */
  beat_name: z.string().nullable().optional(),
  btc_address: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().nullable(),
  sources: z.array(SourceSchema).min(1, "at least one source is required"),
  tags: z.array(z.string()),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  correction_of: z.string().nullable(),
  status: SignalStatusSchema,
  publisher_feedback: z.string().nullable(),
  reviewed_at: z.string().datetime({ offset: true }).nullable(),
  disclosure: z.string(),
});

/**
 * Input schema for filing a new signal.
 * At least one source is required for attribution.
 */
export const SignalCreateSchema = z.object({
  beat_slug: z.string().min(1),
  headline: z.string().min(1),
  body: z.string().optional(),
  sources: z.array(SourceSchema).min(1, "at least one source is required"),
  tags: z.array(z.string()).optional(),
  correction_of: z.string().optional(),
  disclosure: z.string(),
});

export type Source = z.infer<typeof SourceSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type SignalCreate = z.infer<typeof SignalCreateSchema>;

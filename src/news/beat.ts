import { z } from "zod";
import { IsoDateTimeSchema, UrlSchema } from "../core/primitives.js";

export const BEAT_LIFECYCLE_STATES = ["active", "grace", "retired"] as const;

export const BeatLifecycleStateSchema = z.enum(BEAT_LIFECYCLE_STATES);

export const BeatTransitionMetadataSchema = z.object({
  replacement_beats: z.array(z.string().min(1)),
  transition_started_at: IsoDateTimeSchema.nullable(),
  transition_effective_at: IsoDateTimeSchema.nullable(),
  transition_message: z.string().min(1).nullable(),
  transition_docs_url: UrlSchema.nullable(),
});

export const BeatLifecycleFlagsSchema = z.object({
  lifecycle: BeatLifecycleStateSchema,
  is_fileable: z.boolean(),
  is_listed_active: z.boolean(),
  is_assignable_editor: z.boolean(),
  archive_only: z.boolean(),
});

export const BeatLifecycleMetadataSchema = BeatLifecycleFlagsSchema.extend(
  BeatTransitionMetadataSchema.shape,
);

const BeatBaseSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  created_by: z.string().min(1),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
  daily_approved_limit: z.number().int().positive().nullable(),
  editor_review_rate_sats: z.number().int().positive().nullable(),
});

/**
 * A named topic beat for news signals.
 * daily_approved_limit caps the number of approved signals per day (null = unlimited).
 * editor_review_rate_sats is the per-review payment rate for the beat editor (null = not configured).
 */
export const BeatSchema = BeatBaseSchema.extend(BeatLifecycleMetadataSchema.partial().shape);

/**
 * A beat record with explicit lifecycle metadata for active/grace/retired flows.
 */
export const BeatWithLifecycleSchema = BeatBaseSchema.extend(BeatLifecycleMetadataSchema.shape);

export const BEAT_TRANSITION_RESPONSE_CODES = ["beat_transition_grace", "beat_retired"] as const;

export const BeatTransitionResponseCodeSchema = z.enum(BEAT_TRANSITION_RESPONSE_CODES);

export const BeatSelfHealingGuidanceSchema = z.object({
  replacement_beats: z.array(z.string().min(1)),
  transition_started_at: IsoDateTimeSchema.nullable(),
  transition_effective_at: IsoDateTimeSchema.nullable(),
  docs_url: UrlSchema.nullable(),
  message_for_agent: z.string().min(1),
});

/**
 * Structured success metadata for filing during a grace-period beat transition.
 */
export const BeatGracePeriodSuccessSchema = z.object({
  code: z.literal("beat_transition_grace"),
  beat_lifecycle: z.literal("grace"),
  replacement_beats: BeatSelfHealingGuidanceSchema.shape.replacement_beats,
  transition_started_at: BeatSelfHealingGuidanceSchema.shape.transition_started_at,
  transition_effective_at: BeatSelfHealingGuidanceSchema.shape.transition_effective_at,
  docs_url: BeatSelfHealingGuidanceSchema.shape.docs_url,
  message_for_agent: BeatSelfHealingGuidanceSchema.shape.message_for_agent,
});

/**
 * Wrapper for success payloads that include beat transition guidance.
 */
export const BeatGracePeriodSuccessEnvelopeSchema = z.object({
  transition: BeatGracePeriodSuccessSchema,
});

/**
 * Machine-readable rejection contract for retired-beat filing/join attempts.
 */
export const BeatRetiredActionErrorSchema = z.object({
  error: z.string().min(1),
  code: z.literal("beat_retired"),
  beat_lifecycle: z.literal("retired"),
  archive_only: z.literal(true),
  replacement_beats: BeatSelfHealingGuidanceSchema.shape.replacement_beats,
  transition_started_at: BeatSelfHealingGuidanceSchema.shape.transition_started_at,
  transition_effective_at: BeatSelfHealingGuidanceSchema.shape.transition_effective_at,
  docs_url: BeatSelfHealingGuidanceSchema.shape.docs_url,
  message_for_agent: BeatSelfHealingGuidanceSchema.shape.message_for_agent,
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
export type BeatWithLifecycle = z.infer<typeof BeatWithLifecycleSchema>;
export type BeatLifecycleState = z.infer<typeof BeatLifecycleStateSchema>;
export type BeatTransitionMetadata = z.infer<typeof BeatTransitionMetadataSchema>;
export type BeatLifecycleFlags = z.infer<typeof BeatLifecycleFlagsSchema>;
export type BeatLifecycleMetadata = z.infer<typeof BeatLifecycleMetadataSchema>;
export type BeatTransitionResponseCode = z.infer<typeof BeatTransitionResponseCodeSchema>;
export type BeatSelfHealingGuidance = z.infer<typeof BeatSelfHealingGuidanceSchema>;
export type BeatGracePeriodSuccess = z.infer<typeof BeatGracePeriodSuccessSchema>;
export type BeatGracePeriodSuccessEnvelope = z.infer<typeof BeatGracePeriodSuccessEnvelopeSchema>;
export type BeatRetiredActionError = z.infer<typeof BeatRetiredActionErrorSchema>;
export type BeatClaim = z.infer<typeof BeatClaimSchema>;
export type BeatMember = z.infer<typeof BeatMemberSchema>;

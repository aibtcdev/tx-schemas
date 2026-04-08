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

const BEAT_LIFECYCLE_METADATA_KEYS = [
  "lifecycle",
  "is_fileable",
  "is_listed_active",
  "is_assignable_editor",
  "archive_only",
  "replacement_beats",
  "transition_started_at",
  "transition_effective_at",
  "transition_message",
  "transition_docs_url",
] as const satisfies readonly (keyof z.infer<typeof BeatLifecycleMetadataSchema>)[];

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
 * A beat record with explicit lifecycle metadata for active/grace/retired flows.
 */
export const BeatWithLifecycleSchema = BeatBaseSchema.extend(BeatLifecycleMetadataSchema.shape);

/**
 * A named topic beat for news signals.
 * daily_approved_limit caps the number of approved signals per day (null = unlimited).
 * editor_review_rate_sats is the per-review payment rate for the beat editor (null = not configured).
 *
 * Lifecycle metadata is all-or-nothing to avoid ambiguous partial states in downstream consumers.
 */
export const BeatSchema = BeatBaseSchema.extend(BeatLifecycleMetadataSchema.partial().shape).superRefine(
  (beat, ctx) => {
    const presentKeys = BEAT_LIFECYCLE_METADATA_KEYS.filter((key) => key in beat);
    if (presentKeys.length > 0 && presentKeys.length < BEAT_LIFECYCLE_METADATA_KEYS.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Lifecycle metadata must be omitted entirely or provided as a complete set of lifecycle fields.",
      });
    }
  },
);

export const BEAT_TRANSITION_RESPONSE_CODES = ["beat_transition_grace", "beat_retired"] as const;

export const BeatTransitionResponseCodeSchema = z.enum(BEAT_TRANSITION_RESPONSE_CODES);

/**
 * Response payload guidance intentionally uses `docs_url` / `message_for_agent`
 * while persisted beat lifecycle metadata uses `transition_docs_url` / `transition_message`.
 * The Phase 3 cutover contract distinguishes record fields from response fields.
 */
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
export const BeatGracePeriodSuccessSchema = BeatSelfHealingGuidanceSchema.extend({
  code: z.literal("beat_transition_grace"),
  beat_lifecycle: z.literal("grace"),
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
export const BeatRetiredActionErrorSchema = BeatSelfHealingGuidanceSchema.extend({
  error: z.string().min(1),
  code: z.literal("beat_retired"),
  beat_lifecycle: z.literal("retired"),
  archive_only: z.literal(true),
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

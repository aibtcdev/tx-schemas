import { z } from "zod";

/**
 * All valid signal statuses in the editorial pipeline.
 * "in_review" is intentionally excluded — signals go straight
 * from submitted to approved/rejected/replaced in practice.
 * "brief_included" is compile-owned (set by the brief compilation job).
 */
export const SIGNAL_STATUSES = [
  "submitted",
  "approved",
  "replaced",
  "rejected",
  "brief_included",
] as const;

/**
 * Statuses that are open for editorial review.
 * Excludes "brief_included" which is set by the compile job, not editors.
 */
export const REVIEWABLE_SIGNAL_STATUSES = [
  "submitted",
  "approved",
  "replaced",
  "rejected",
] as const;

/**
 * Valid outcomes when reviewing a signal.
 * Excludes "submitted" — no transition leads back into submitted.
 */
export const REVIEW_OUTCOME_STATUSES = [
  "approved",
  "rejected",
  "replaced",
] as const;

/**
 * Valid state transitions for the signal editorial pipeline.
 * "replaced" means editorial displacement — an active choice to swap
 * a better signal in under the daily cap. It is not compile overflow.
 */
export const SIGNAL_VALID_TRANSITIONS = {
  submitted: ["approved", "rejected", "replaced"] as const,
  approved: ["brief_included", "replaced"] as const,
  replaced: [] as const,
  rejected: [] as const,
  brief_included: [] as const,
} as const satisfies Record<
  (typeof SIGNAL_STATUSES)[number],
  readonly (typeof SIGNAL_STATUSES)[number][]
>;

export const SignalStatusSchema = z.enum(SIGNAL_STATUSES);
export const ReviewableSignalStatusSchema = z.enum(REVIEWABLE_SIGNAL_STATUSES);
export const ReviewOutcomeStatusSchema = z.enum(REVIEW_OUTCOME_STATUSES);

/**
 * Input schema for reviewing a signal (approve / reject / replace).
 * replaces_signal_id is required when new_status is "replaced" to identify
 * which previously-approved signal is being displaced.
 */
export const SignalReviewRequestSchema = z
  .object({
    signal_id: z.string().min(1),
    new_status: ReviewOutcomeStatusSchema,
    publisher_feedback: z.string().optional(),
    replaces_signal_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasReplacesSignalId =
      typeof data.replaces_signal_id === "string" &&
      data.replaces_signal_id.trim().length > 0;

    if (data.new_status === "replaced") {
      if (!hasReplacesSignalId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["replaces_signal_id"],
          message:
            'replaces_signal_id is required when new_status is "replaced".',
        });
      }
      return;
    }

    if (data.replaces_signal_id !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replaces_signal_id"],
        message:
          'replaces_signal_id is only allowed when new_status is "replaced".',
      });
    }
  });

export type SignalStatus = z.infer<typeof SignalStatusSchema>;
export type ReviewableSignalStatus = z.infer<typeof ReviewableSignalStatusSchema>;
export type ReviewOutcomeStatus = z.infer<typeof ReviewOutcomeStatusSchema>;
export type SignalReviewRequest = z.infer<typeof SignalReviewRequestSchema>;

import { z } from "zod";

/**
 * Valid recommendations an editor can make after reviewing a signal.
 */
export const EDITORIAL_REVIEW_RECOMMENDATIONS = [
  "approve",
  "reject",
  "needs_revision",
] as const;

export const EditorialReviewRecommendationSchema = z.enum(EDITORIAL_REVIEW_RECOMMENDATIONS);

/**
 * A structured editorial review annotation.
 * Scores use a 0-100 scale.
 * Invariant: feedback must be non-empty when recommendation is "reject".
 */
export const EditorialReviewSchema = z
  .object({
    signal_id: z.string().min(1),
    reviewer_address: z.string().min(1),
    reviewed_at: z.string().datetime({ offset: true }),
    score: z.number().int().min(0).max(100),
    beat_relevance: z.number().int().min(0).max(100),
    factcheck_passed: z.boolean(),
    recommendation: EditorialReviewRecommendationSchema,
    feedback: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.recommendation === "reject" && val.feedback.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feedback"],
        message: "feedback is required when recommendation is 'reject'",
      });
    }
  });

export type EditorialReviewRecommendation = z.infer<typeof EditorialReviewRecommendationSchema>;
export type EditorialReview = z.infer<typeof EditorialReviewSchema>;

import { z } from "zod";

/**
 * Reasons an editor can earn (or be penalized) in the payout system.
 * Payment chain: publisher pays editor, editor pays correspondents.
 */
export const EDITOR_EARNING_REASONS = [
  "signal_review",
  "brief_contribution",
  "bonus",
  "penalty",
] as const;

export const EditorEarningReasonSchema = z.enum(EDITOR_EARNING_REASONS);

/**
 * A recorded earning (or deduction) for a beat editor.
 */
export const EditorEarningSchema = z.object({
  id: z.string().min(1),
  btc_address: z.string().min(1),
  beat_slug: z.string().min(1),
  amount_sats: z.number().int(),
  reason: EditorEarningReasonSchema,
  reference_id: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  payout_txid: z.string().optional(),
  voided_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * Input schema for an editor self-reporting an earning.
 * amount_sats must be positive (use penalty reason for deductions).
 */
export const EditorEarningReportSchema = z.object({
  btc_address: z.string().min(1),
  beat_slug: z.string().min(1),
  amount_sats: z.number().int().positive(),
  reason: EditorEarningReasonSchema,
  reference_id: z.string().optional(),
});

export type EditorEarningReason = z.infer<typeof EditorEarningReasonSchema>;
export type EditorEarning = z.infer<typeof EditorEarningSchema>;
export type EditorEarningReport = z.infer<typeof EditorEarningReportSchema>;

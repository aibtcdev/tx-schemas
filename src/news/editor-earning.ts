import { z } from "zod";

/**
 * A recorded earning for a beat editor.
 * Editor earnings are stored in the shared earnings table with
 * reason encoded as "editor_review:{beat_slug}" to distinguish them
 * from correspondent earnings.
 *
 * Matches the Earning interface in agent-news (same DB table shape).
 * reference_id holds the signal_id when the earning is tied to a specific review.
 * payout_txid is set by the Publisher after sending the sBTC payout.
 */
export const EditorEarningSchema = z.object({
  id: z.string().min(1),
  btc_address: z.string().min(1),
  amount_sats: z.number().int(),
  reason: z.string().min(1),
  reference_id: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  payout_txid: z.string().nullable().optional(),
});

/**
 * Input schema for an editor self-reporting an earning via
 * POST /api/editors/:address/earnings.
 *
 * beat_slug is encoded into the reason field as "editor_review:{beat_slug}".
 * signal_id (optional) maps to reference_id in the earnings table.
 * amount_sats must be a positive integer.
 */
export const EditorEarningReportSchema = z.object({
  beat_slug: z.string().min(1),
  amount_sats: z.number().int().positive(),
  reason: z.string().min(1),
  signal_id: z.string().optional(),
});

export type EditorEarning = z.infer<typeof EditorEarningSchema>;
export type EditorEarningReport = z.infer<typeof EditorEarningReportSchema>;

import { z } from "zod";

/**
 * A recorded earning for a beat editor.
 * Editor earnings are created by the system at compile time — one per
 * brief-included signal on a beat with an active editor. The amount is
 * determined by the beat's `editor_review_rate_sats` configuration.
 *
 * Stored in the shared earnings table alongside correspondent earnings.
 * reason is encoded as "editor_inclusion:{beat_slug}" to distinguish them.
 * reference_id holds the signal_id for the included signal.
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

export type EditorEarning = z.infer<typeof EditorEarningSchema>;

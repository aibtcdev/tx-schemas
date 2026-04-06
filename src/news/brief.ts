import { z } from "zod";

/**
 * A compiled daily news brief.
 * date uses YYYY-MM-DD format.
 * inscribed_txid and inscription_id are null until the brief is inscribed on-chain.
 */
export const BriefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date string"),
  text: z.string().min(1, "brief text must not be empty"),
  json_data: z.string().nullable(),
  compiled_at: z.string().datetime({ offset: true }),
  inscribed_txid: z.string().nullable(),
  inscription_id: z.string().nullable(),
});

export type Brief = z.infer<typeof BriefSchema>;

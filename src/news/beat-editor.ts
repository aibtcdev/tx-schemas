import { z } from "zod";

/**
 * Lifecycle statuses for a beat editor assignment.
 */
export const EDITOR_STATUSES = [
  "active",
  "suspended",
  "deactivated",
] as const;

export const EditorStatusSchema = z.enum(EDITOR_STATUSES);

/**
 * A beat editor registration record.
 * Each editor is scoped to a single beat at a time.
 */
export const BeatEditorSchema = z.object({
  beat_slug: z.string().min(1),
  btc_address: z.string().min(1),
  status: EditorStatusSchema,
  registered_at: z.string().datetime({ offset: true }),
  registered_by: z.string().min(1),
  deactivated_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * Input schema for registering a new beat editor.
 */
export const BeatEditorRegistrationSchema = z.object({
  beat_slug: z.string().min(1),
  btc_address: z.string().min(1),
  registered_by: z.string().min(1),
});

export type EditorStatus = z.infer<typeof EditorStatusSchema>;
export type BeatEditor = z.infer<typeof BeatEditorSchema>;
export type BeatEditorRegistration = z.infer<typeof BeatEditorRegistrationSchema>;

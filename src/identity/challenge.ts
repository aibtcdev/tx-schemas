import { z } from "zod";

/**
 * Challenge envelope issued by an auth server. The server signs nothing —
 * the agent signs the `message` and returns it via the matching response.
 *
 * Shape mirrors landing-page/lib/challenge.ts so identity migration to
 * @aibtc/platform/auth is a drop-in for existing call sites.
 */
export const ChallengeSchema = z.object({
  message: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  action: z.string().min(1),
});

export type Challenge = z.infer<typeof ChallengeSchema>;

/**
 * Stored form of a challenge, as persisted in KV (or any future store).
 * `createdAt` is added at write time; `message`/`expiresAt`/`action`
 * carry through from the issued ChallengeSchema.
 */
export const ChallengeStoreRecordSchema = ChallengeSchema.extend({
  createdAt: z.string().datetime({ offset: true }),
});

export type ChallengeStoreRecord = z.infer<typeof ChallengeStoreRecordSchema>;

/**
 * A challenge response — the signed challenge plus the address that
 * produced the signature. Used as the input to verifyChallenge().
 */
export const ChallengeResponseSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  address: z.string().min(1),
});

export type ChallengeResponse = z.infer<typeof ChallengeResponseSchema>;

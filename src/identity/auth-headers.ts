import { z } from "zod";

/**
 * Authentication headers used by services that accept BIP-322/BIP-137
 * signed requests (agent-news, landing-page authenticated routes,
 * x402-api editorial calls).
 *
 * Header names: `X-BTC-Address`, `X-BTC-Signature` (base64),
 * `X-BTC-Timestamp` (Unix seconds string).
 *
 * The signed message is constructed by the verifier from the request
 * (typically `"{METHOD} {path}:{timestamp}"`) — this schema only carries
 * the per-request header payload.
 */
export const BitcoinAuthHeadersSchema = z.object({
  address: z.string().min(1),
  signature: z.string().min(1),
  /** Unix seconds, as a string (HTTP header value) */
  timestamp: z.string().regex(/^\d+$/),
});

export type BitcoinAuthHeaders = z.infer<typeof BitcoinAuthHeadersSchema>;

/**
 * Authentication headers used by services that accept SIP-018 signed
 * requests (x402-sponsor-relay sponsor auth, registry registration).
 *
 * Header names: `X-STX-Address`, `X-STX-Signature`, `X-STX-Timestamp`,
 * `X-STX-Domain` (JSON-encoded SIP-018 domain).
 */
export const StacksAuthHeadersSchema = z.object({
  stxAddress: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  /** JSON-encoded Sip018Domain — verifier parses + checks against expected */
  domain: z.string().min(1),
});

export type StacksAuthHeaders = z.infer<typeof StacksAuthHeadersSchema>;

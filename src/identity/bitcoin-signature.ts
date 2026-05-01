import { z } from "zod";

/**
 * Address kinds we can produce a Bitcoin signature against.
 * P2WPKH is the only one currently authenticated end-to-end across
 * services (see agent-news/src/services/auth.ts). P2TR is reserved
 * for the future taproot unlock.
 */
export const BitcoinAddressKindSchema = z.enum([
  "p2wpkh", // bc1q... — primary
  "p2pkh", // 1... — legacy compact
  "p2sh", // 3... — wrapped segwit
  "p2tr", // bc1p... — reserved, not yet verified end-to-end
]);

export type BitcoinAddressKind = z.infer<typeof BitcoinAddressKindSchema>;

/**
 * Bitcoin signature schemes supported across services. BIP-137 is the
 * legacy compact (Electrum-style) format. BIP-322 is the modern
 * witness-serialized format used by aibtc MCP and most current wallets.
 */
export const BitcoinSignatureSchemeSchema = z.enum(["bip137", "bip322"]);

export type BitcoinSignatureScheme = z.infer<
  typeof BitcoinSignatureSchemeSchema
>;

/**
 * A claim that an entity controls a specific Bitcoin address by signing
 * a message. The verifier produces an Ok({ address, scheme }) result if
 * the signature recovers/produces the expected address.
 */
export const BitcoinSignaturePayloadSchema = z.object({
  message: z.string().min(1),
  /** base64-encoded signature; format per `scheme` */
  signature: z.string().min(1),
  /** the address claimed by the signer */
  address: z.string().min(1),
  /** optional explicit scheme; verifiers should auto-detect when absent */
  scheme: BitcoinSignatureSchemeSchema.optional(),
});

export type BitcoinSignaturePayload = z.infer<
  typeof BitcoinSignaturePayloadSchema
>;

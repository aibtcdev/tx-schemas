import { z } from "zod";
import { BitcoinSignaturePayloadSchema } from "./bitcoin-signature.js";
import { StacksSignaturePayloadSchema } from "./stacks-signature.js";

/**
 * A claim that one entity controls both a Bitcoin address and a Stacks
 * address, by producing a BIP-322 (or BIP-137) signature on the BTC
 * side and a SIP-018 signature on the STX side over the same logical
 * action/payload.
 *
 * @aibtc/platform/auth.verifyDualSig() resolves this claim into a
 * canonical `{ btcAddress, stxAddress }` pair if both signatures
 * verify and reference the same action.
 */
export const DualSigClaimSchema = z.object({
  bitcoin: BitcoinSignaturePayloadSchema,
  stacks: StacksSignaturePayloadSchema,
});

export type DualSigClaim = z.infer<typeof DualSigClaimSchema>;

/**
 * Resolved address pair from a successful dual-signature verification.
 * Other identifiers (`owner`, `github`, etc.) are sourced separately —
 * the dual-sig itself only proves control of the on-chain addresses.
 */
export const AddressPairSchema = z.object({
  btcAddress: z.string().min(1),
  stxAddress: z.string().min(1),
});

export type AddressPair = z.infer<typeof AddressPairSchema>;

import { z } from "zod";

/**
 * Stacks network identifiers used in SIP-018 domain envelopes.
 */
export const StacksNetworkSchema = z.enum(["mainnet", "testnet"]);

export type StacksNetwork = z.infer<typeof StacksNetworkSchema>;

/**
 * SIP-018 domain — pinned to a name+version+network triple. Verifiers
 * compare the supplied domain against an expected domain before
 * accepting a signature, preventing cross-app replay.
 */
export const Sip018DomainSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  network: StacksNetworkSchema,
});

export type Sip018Domain = z.infer<typeof Sip018DomainSchema>;

/**
 * SIP-018 signed structured-data payload. `message` carries the
 * arbitrary application payload (already serialized for hashing per
 * SIP-018), `signature` is the Stacks-format signature, and
 * `stxAddress` is the address claimed by the signer.
 *
 * The platform verifier combines `(domain, message)` into the structured
 * data hash, recovers the signer pubkey, and confirms it matches
 * `stxAddress`.
 */
export const StacksSignaturePayloadSchema = z.object({
  domain: Sip018DomainSchema,
  message: z.string().min(1),
  signature: z.string().min(1),
  stxAddress: z.string().min(1),
});

export type StacksSignaturePayload = z.infer<
  typeof StacksSignaturePayloadSchema
>;

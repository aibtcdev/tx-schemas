import { describe, expect, it } from "vitest";
import {
  ChallengeSchema,
  ChallengeStoreRecordSchema,
  ChallengeResponseSchema,
  BitcoinAddressKindSchema,
  BitcoinSignatureSchemeSchema,
  BitcoinSignaturePayloadSchema,
  StacksNetworkSchema,
  Sip018DomainSchema,
  StacksSignaturePayloadSchema,
  DualSigClaimSchema,
  AddressPairSchema,
  BitcoinAuthHeadersSchema,
  StacksAuthHeadersSchema,
} from "../../src/identity/index.js";

const FUTURE_DATETIME = "2026-12-31T00:00:00Z";
const PAST_DATETIME = "2026-04-30T00:00:00Z";
const BTC_ADDR = "bc1qexampleexampleexampleexampleexampleex";
const STX_ADDR = "SP000000000000000000002Q6VF78";

describe("identity / challenge schemas", () => {
  it("accepts a well-formed challenge", () => {
    const result = ChallengeSchema.safeParse({
      message: "Challenge: update-description for bc1q... at 2026-05-01T00:00:00Z",
      expiresAt: FUTURE_DATETIME,
      action: "update-description",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty action", () => {
    const result = ChallengeSchema.safeParse({
      message: "x",
      expiresAt: FUTURE_DATETIME,
      action: "",
    });
    expect(result.success).toBe(false);
  });

  it("ChallengeStoreRecord requires createdAt", () => {
    const result = ChallengeStoreRecordSchema.safeParse({
      message: "x",
      expiresAt: FUTURE_DATETIME,
      action: "x",
      createdAt: PAST_DATETIME,
    });
    expect(result.success).toBe(true);
  });

  it("ChallengeResponse requires message + signature + address", () => {
    const result = ChallengeResponseSchema.safeParse({
      message: "x",
      signature: "deadbeef",
      address: BTC_ADDR,
    });
    expect(result.success).toBe(true);
  });
});

describe("identity / bitcoin signature schemas", () => {
  it("accepts known address kinds", () => {
    for (const kind of ["p2wpkh", "p2pkh", "p2sh", "p2tr"] as const) {
      expect(BitcoinAddressKindSchema.safeParse(kind).success).toBe(true);
    }
  });

  it("rejects unknown address kinds", () => {
    expect(BitcoinAddressKindSchema.safeParse("p2multisig").success).toBe(
      false,
    );
  });

  it("accepts both signature schemes", () => {
    expect(BitcoinSignatureSchemeSchema.safeParse("bip137").success).toBe(true);
    expect(BitcoinSignatureSchemeSchema.safeParse("bip322").success).toBe(true);
  });

  it("BitcoinSignaturePayload allows omitting scheme", () => {
    const result = BitcoinSignaturePayloadSchema.safeParse({
      message: "POST /api/signals:1735000000",
      signature: "AkgwRQIhAP...",
      address: BTC_ADDR,
    });
    expect(result.success).toBe(true);
  });
});

describe("identity / stacks signature schemas", () => {
  it("accepts mainnet/testnet", () => {
    expect(StacksNetworkSchema.safeParse("mainnet").success).toBe(true);
    expect(StacksNetworkSchema.safeParse("testnet").success).toBe(true);
    expect(StacksNetworkSchema.safeParse("regtest").success).toBe(false);
  });

  it("Sip018Domain requires name+version+network", () => {
    const result = Sip018DomainSchema.safeParse({
      name: "x402-sponsor-relay",
      version: "1",
      network: "mainnet",
    });
    expect(result.success).toBe(true);
  });

  it("StacksSignaturePayload composes domain + message + sig + address", () => {
    const result = StacksSignaturePayloadSchema.safeParse({
      domain: { name: "n", version: "1", network: "mainnet" },
      message: "{}",
      signature: "0x" + "0".repeat(130),
      stxAddress: STX_ADDR,
    });
    expect(result.success).toBe(true);
  });
});

describe("identity / dual-sig schemas", () => {
  it("DualSigClaim composes both halves", () => {
    const result = DualSigClaimSchema.safeParse({
      bitcoin: {
        message: "x",
        signature: "y",
        address: BTC_ADDR,
      },
      stacks: {
        domain: { name: "n", version: "1", network: "mainnet" },
        message: "{}",
        signature: "0x" + "0".repeat(130),
        stxAddress: STX_ADDR,
      },
    });
    expect(result.success).toBe(true);
  });

  it("AddressPair is just btcAddress + stxAddress", () => {
    const result = AddressPairSchema.safeParse({
      btcAddress: BTC_ADDR,
      stxAddress: STX_ADDR,
    });
    expect(result.success).toBe(true);
  });
});

describe("identity / auth header schemas", () => {
  it("BitcoinAuthHeaders accepts a numeric timestamp string", () => {
    const result = BitcoinAuthHeadersSchema.safeParse({
      address: BTC_ADDR,
      signature: "AkgwRQIhAP...",
      timestamp: "1735000000",
    });
    expect(result.success).toBe(true);
  });

  it("BitcoinAuthHeaders rejects a non-numeric timestamp", () => {
    const result = BitcoinAuthHeadersSchema.safeParse({
      address: BTC_ADDR,
      signature: "x",
      timestamp: "not-a-number",
    });
    expect(result.success).toBe(false);
  });

  it("StacksAuthHeaders requires a JSON-encoded domain string", () => {
    const result = StacksAuthHeadersSchema.safeParse({
      stxAddress: STX_ADDR,
      signature: "0x" + "0".repeat(130),
      timestamp: "1735000000",
      domain: JSON.stringify({ name: "n", version: "1", network: "mainnet" }),
    });
    expect(result.success).toBe(true);
  });
});

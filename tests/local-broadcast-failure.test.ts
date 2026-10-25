import { describe, expect, it } from "vitest";
import {
  BroadcastAttemptOutcomeSchema,
  LocalBroadcastFailureSchema,
  parseLocalBroadcastFailure,
} from "../src/index.js";

// Messages captured from @stacks/transactions@7.3.1 (see LOCAL_BROADCAST_FAILURE_PATTERNS).
class DeserializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeserializationError";
  }
}
class SigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningError";
  }
}

describe("parseLocalBroadcastFailure", () => {
  it("classifies sponsor-signing a standard tx as auth_type_mismatch", () => {
    expect(parseLocalBroadcastFailure(new SigningError("Cannot sponsor sign a non-sponsored transaction"))).toEqual({
      kind: "auth_type_mismatch",
      reason: "Cannot sponsor sign a non-sponsored transaction",
    });
    expect(parseLocalBroadcastFailure(new Error("Cannot add sponsor to non-sponsored transaction"))?.kind).toBe(
      "auth_type_mismatch",
    );
  });

  it("classifies DeserializationError by name, whatever the message", () => {
    expect(parseLocalBroadcastFailure(new DeserializationError("Could not parse undefined as AuthType"))).toEqual({
      kind: "deserialize_failed",
      reason: "Could not parse undefined as AuthType",
    });
    expect(parseLocalBroadcastFailure(new DeserializationError("some future wording"))?.kind).toBe("deserialize_failed");
  });

  it("classifies a plain Error from deserializing empty hex as deserialize_failed", () => {
    expect(parseLocalBroadcastFailure(new Error("Could not parse undefined as TransactionVersion"))?.kind).toBe(
      "deserialize_failed",
    );
  });

  it("classifies non-hex input as malformed_bytes", () => {
    expect(parseLocalBroadcastFailure(new Error("Invalid byte sequence"))?.kind).toBe("malformed_bytes");
  });

  it("keeps the relay's existing patterns", () => {
    expect(parseLocalBroadcastFailure(new Error("Failed to deserialize transaction"))?.kind).toBe("deserialize_failed");
    expect(parseLocalBroadcastFailure("malformed payload")?.kind).toBe("malformed_bytes");
  });

  it("returns null for unrelated errors so callers keep their own handling", () => {
    expect(parseLocalBroadcastFailure(new Error("fetch failed"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error("NotEnoughFunds"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error(""))).toBeNull();
    expect(parseLocalBroadcastFailure(undefined)).toBeNull();
  });

  it("produces values the schema accepts", () => {
    const parsed = parseLocalBroadcastFailure(new Error("Invalid byte sequence"));
    expect(LocalBroadcastFailureSchema.safeParse(parsed).success).toBe(true);
  });
});

describe("BroadcastAttemptOutcomeSchema", () => {
  it("accepts a node outcome and a local failure", () => {
    expect(BroadcastAttemptOutcomeSchema.safeParse({ source: "node", node: { outcome: "accepted" } }).success).toBe(true);
    expect(
      BroadcastAttemptOutcomeSchema.safeParse({ source: "local", local: { kind: "unknown_local", reason: "x" } }).success,
    ).toBe(true);
  });

  it("rejects mismatched payloads and empty reasons", () => {
    expect(BroadcastAttemptOutcomeSchema.safeParse({ source: "local", node: { outcome: "accepted" } }).success).toBe(false);
    expect(LocalBroadcastFailureSchema.safeParse({ kind: "malformed_bytes", reason: "" }).success).toBe(false);
  });
});

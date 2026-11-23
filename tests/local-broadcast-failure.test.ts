import { describe, expect, it } from "vitest";
import {
  BroadcastAttemptOutcomeSchema,
  LocalBroadcastFailureSchema,
  parseLocalBroadcastFailure,
} from "../src/index.js";

// Messages copied from the throw sites in @stacks/transactions 7.7.0 (SigningError, DeserializationError,
// the enum decoders) and @stacks/common 7.7.0 (hexToBytes). See LOCAL_BROADCAST_FAILURE_PATTERNS.
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

  it("does not match node or API errors that merely mention the same words", () => {
    // a node 400 or an upstream fetch rethrown in the same try must not be blamed on the local library
    expect(parseLocalBroadcastFailure(new Error("Failed to deserialize transaction: bad payload"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error("Malformed JSON in response"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error("Malformed ABI. Contains multiple functions with the same name"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error("node said: non-sponsored transaction rejected"))).toBeNull();
    expect(parseLocalBroadcastFailure(new Error("Could not parse foo as uint"))).toBeNull();
  });

  it("classifies a DeserializationError with an empty message by its name", () => {
    expect(parseLocalBroadcastFailure(new DeserializationError(""))).toEqual({
      kind: "deserialize_failed",
      reason: "DeserializationError",
    });
  });

  it("classifies error-shaped values from another realm or a worker boundary", () => {
    expect(
      parseLocalBroadcastFailure({ name: "DeserializationError", message: "Could not parse undefined as AuthType" })?.kind,
    ).toBe("deserialize_failed");
    expect(parseLocalBroadcastFailure({ message: "Invalid byte sequence" })?.kind).toBe("malformed_bytes");
  });

  it("never throws, even on values that cannot be stringified", () => {
    expect(() => parseLocalBroadcastFailure(Object.create(null))).not.toThrow();
    expect(parseLocalBroadcastFailure(Object.create(null))).toBeNull();
    const hostile = { get message(): string { throw new Error("boom"); } };
    expect(() => parseLocalBroadcastFailure(hostile)).not.toThrow();
    expect(parseLocalBroadcastFailure(hostile)).toBeNull();
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

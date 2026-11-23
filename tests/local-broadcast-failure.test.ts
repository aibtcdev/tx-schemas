import { describe, expect, it } from "vitest";
import {
  BroadcastAttemptOutcomeSchema,
  LocalBroadcastFailureSchema,
  parseLocalBroadcastFailure,
  decideLocalBroadcastFailure,
} from "../src/core/local-broadcast-failure.js";

describe("parseLocalBroadcastFailure", () => {
  it("classifies auth type mismatch", () => {
    const f = parseLocalBroadcastFailure(new Error("Cannot sponsor sign a non-sponsored transaction"));
    expect(f.kind).toBe("auth_type_mismatch");
  });
  it("classifies deserialize failure", () => {
    const f = parseLocalBroadcastFailure(new Error("Failed to deserialize transaction: bad hex"));
    expect(f.kind).toBe("deserialize_failed");
  });
  it("classifies malformed bytes", () => {
    const f = parseLocalBroadcastFailure(new Error("malformed byte length in payload"));
    expect(f.kind).toBe("malformed_bytes");
  });
  it("falls back to unknown_local for unrecognized errors", () => {
    const f = parseLocalBroadcastFailure(new Error("socket hangup"));
    expect(f.kind).toBe("unknown_local");
  });
  it("handles non-Error throws", () => {
    const f = parseLocalBroadcastFailure("weird string failure");
    expect(f.kind).toBe("unknown_local");
  });
});

describe("LocalBroadcastFailureSchema", () => {
  it("accepts all four kinds", () => {
    for (const kind of ["auth_type_mismatch", "deserialize_failed", "malformed_bytes", "unknown_local"]) {
      expect(LocalBroadcastFailureSchema.safeParse({ kind, reason: "r" }).success).toBe(true);
    }
  });
});

describe("BroadcastAttemptOutcomeSchema", () => {
  it("accepts node and local sources", () => {
    expect(BroadcastAttemptOutcomeSchema.safeParse({
      source: "local",
      local: { kind: "unknown_local", reason: "x" },
    }).success).toBe(true);
    expect(BroadcastAttemptOutcomeSchema.safeParse({
      source: "node",
      node: { outcome: "accepted" },
    }).success).toBe(true);
  });
});

describe("decideLocalBroadcastFailure", () => {
  it("retires structural failures", () => {
    for (const kind of ["auth_type_mismatch", "deserialize_failed", "malformed_bytes"] as const) {
      expect(decideLocalBroadcastFailure({ kind, reason: "r" })).toEqual({ responsible: "relay", action: "retire" });
    }
  });
  it("alerts on unknown_local", () => {
    expect(decideLocalBroadcastFailure({ kind: "unknown_local", reason: "r" }))
      .toEqual({ responsible: "relay", action: "alert_for_review" });
  });
});

import { describe, expect, it } from "vitest";
import {
  RpcCheckPaymentResultSchema,
  RpcSubmitPaymentResultSchema,
} from "../src/index.js";

describe("rpc schemas", () => {
  it("accepts an in-flight submit response from the relay", () => {
    const result = RpcSubmitPaymentResultSchema.parse({
      accepted: true,
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "queued_with_warning",
      senderNonce: {
        provided: 9,
        expected: 9,
        healthy: true,
      },
      warning: {
        code: "SENDER_NONCE_GAP",
        detail: "Gap detected",
        senderNonce: {
          provided: 9,
          expected: 8,
          lastSeen: 7,
        },
        help: "Check your sender nonce",
        action: "Submit the missing nonce",
      },
      checkStatusUrl: "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("Expected an accepted RPC submit result");
    }
    expect(result.status).toBe("queued_with_warning");
  });

  it("accepts idempotent duplicate recovery by reusing the existing payment identity", () => {
    const result = RpcSubmitPaymentResultSchema.parse({
      accepted: true,
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "queued",
      checkStatusUrl: "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    });

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("Expected an accepted RPC submit result");
    }
    expect(result.paymentId).toBe("pay_01JMVP9QE8XA3BDGM5RN7KWTZ4");
    expect(result.status).toBe("queued");
  });

  it("accepts a rejected submit response with relay-specific error codes", () => {
    const result = RpcSubmitPaymentResultSchema.parse({
      accepted: false,
      error: "Transaction must be sponsored",
      code: "NOT_SPONSORED",
      retryable: false,
    });

    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error("Expected a rejected RPC submit result");
    }
    expect(result.code).toBe("NOT_SPONSORED");
  });

  it("accepts a rejected submit response for a true same-nonce conflict", () => {
    const result = RpcSubmitPaymentResultSchema.parse({
      accepted: false,
      error: "A different transaction already uses this sender nonce",
      code: "NONCE_CONFLICT",
      retryable: false,
    });

    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error("Expected a rejected RPC submit result");
    }
    expect(result.code).toBe("NONCE_CONFLICT");
  });

  it("accepts terminal payment checks", () => {
    const result = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "failed",
      terminalReason: "broadcast_failure",
      error: "Broadcast failed",
      errorCode: "BROADCAST_FAILED",
      retryable: true,
    });

    expect(result.status).toBe("failed");
    expect(result.terminalReason).toBe("broadcast_failure");
    expect(result.errorCode).toBe("BROADCAST_FAILED");
  });
});

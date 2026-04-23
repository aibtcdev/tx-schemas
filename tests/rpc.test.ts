import { describe, expect, it } from "vitest";
import {
  RpcCheckPaymentResultSchema,
  RpcSubmitPaymentRequestSchema,
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

  it("accepts duplicate reuse responses that surface the current in-flight caller-facing status", () => {
    for (const status of ["queued", "broadcasting", "mempool"] as const) {
      const result = RpcSubmitPaymentResultSchema.parse({
        accepted: true,
        paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
        status,
        checkStatusUrl: "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      });

      expect(result.accepted).toBe(true);
      if (!result.accepted) {
        throw new Error("Expected an accepted RPC submit result");
      }
      expect(result.status).toBe(status);
    }
  });

  it("rejects the internal-only submitted status from accepted submit responses", () => {
    const result = RpcSubmitPaymentResultSchema.safeParse({
      accepted: true,
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "submitted",
    });

    expect(result.success).toBe(false);
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
      checkStatusUrl: "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    });

    expect(result.status).toBe("failed");
    expect(result.terminalReason).toBe("broadcast_failure");
    expect(result.errorCode).toBe("BROADCAST_FAILED");
    expect(result.checkStatusUrl).toBe(
      "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    );
  });

  it("accepts poll-url hints on in-flight payment checks", () => {
    const result = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "queued",
      checkStatusUrl: "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    });

    expect(result.status).toBe("queued");
    expect(result.checkStatusUrl).toBe(
      "https://example.com/payment/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    );
  });

  describe("paymentIdentifier — x402 V2 idempotency parity", () => {
    const STUB_TX_HEX = "0x" + "ab".repeat(32);

    it("accepts a submit request with an optional paymentIdentifier", () => {
      const req = RpcSubmitPaymentRequestSchema.parse({
        txHex: STUB_TX_HEX,
        paymentIdentifier: "pay_01JMVP9QE8XA3BDGM5",
      });
      expect(req.paymentIdentifier).toBe("pay_01JMVP9QE8XA3BDGM5");
    });

    it("accepts a submit request without paymentIdentifier (backward compat)", () => {
      const req = RpcSubmitPaymentRequestSchema.parse({ txHex: STUB_TX_HEX });
      expect(req.paymentIdentifier).toBeUndefined();
    });

    it("rejects a paymentIdentifier shorter than 16 chars", () => {
      const result = RpcSubmitPaymentRequestSchema.safeParse({
        txHex: STUB_TX_HEX,
        paymentIdentifier: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a paymentIdentifier longer than 128 chars", () => {
      const result = RpcSubmitPaymentRequestSchema.safeParse({
        txHex: STUB_TX_HEX,
        paymentIdentifier: "a".repeat(129),
      });
      expect(result.success).toBe(false);
    });

    it("rejects a paymentIdentifier with disallowed characters", () => {
      const result = RpcSubmitPaymentRequestSchema.safeParse({
        txHex: STUB_TX_HEX,
        paymentIdentifier: "invalid identifier!",
      });
      expect(result.success).toBe(false);
    });

    it("accepts PAYMENT_IDENTIFIER_CONFLICT as a rejected submit error code", () => {
      const result = RpcSubmitPaymentResultSchema.parse({
        accepted: false,
        error: "Same paymentIdentifier submitted with a different transaction",
        code: "PAYMENT_IDENTIFIER_CONFLICT",
        retryable: false,
      });

      expect(result.accepted).toBe(false);
      if (result.accepted) {
        throw new Error("Expected a rejected RPC submit result");
      }
      expect(result.code).toBe("PAYMENT_IDENTIFIER_CONFLICT");
    });
  });
});

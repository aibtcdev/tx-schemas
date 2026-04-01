import { describe, expect, it } from "vitest";
import {
  HttpPaymentStatusResponseSchema,
  HttpSettleRequestSchema,
  HttpSettleResponseSchema,
} from "../src/index.js";

describe("http schemas", () => {
  it("accepts an x402 settle request with a payment identifier extension", () => {
    const result = HttpSettleRequestSchema.parse({
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        payload: {
          transaction: "0x" + "a".repeat(64),
        },
        extensions: {
          "payment-identifier": {
            info: {
              id: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
            },
          },
        },
      },
      paymentRequirements: {
        scheme: "exact",
        network: "stacks:1",
        amount: "1000",
        asset: "STX",
        payTo: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
        maxTimeoutSeconds: 60,
      },
    });

    expect(result.paymentRequirements.amount).toBe("1000");
  });

  it("accepts held settle failures with queue guidance", () => {
    const result = HttpSettleResponseSchema.parse({
      success: false,
      errorReason: "broadcast_failed",
      transaction: "",
      network: "stacks:1",
      queue: {
        status: "held",
        senderNonce: 8,
        nextExpectedNonce: 6,
        missingNonces: [6, 7],
        handSize: 3,
        estimatedDispatchMs: null,
        expiresAt: "2026-03-30T12:00:00Z",
        help: "Submit the missing nonces before retrying.",
      },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected a failed settle response");
    }
    expect(result.queue?.status).toBe("held");
  });

  it("accepts external payment status polling responses", () => {
    const result = HttpPaymentStatusResponseSchema.parse({
      paymentId: "pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
      status: "mempool",
      txid: "0x" + "b".repeat(64),
      checkStatusUrl: "/api/payment-status/pay_01JMVP9QE8XA3BDGM5RN7KWTZ4",
    });

    expect(result.status).toBe("mempool");
  });
});

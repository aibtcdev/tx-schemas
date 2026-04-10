import { describe, expect, it } from "vitest";
import {
  CANONICAL_POLLING_IDENTITY_FIELDS,
  HttpPaymentStatusResponseSchema,
  PAYMENT_STATE_DEFAULT_DELIVERY,
  PAYMENT_STATE_TO_CATEGORY,
  RpcCheckPaymentResultSchema,
  TERMINAL_REASON_CATEGORY_HANDLING,
  TERMINAL_REASON_TO_STATE,
} from "../src/index.js";

describe("rpc/http semantic parity", () => {
  it("maps equivalent in-flight statuses onto the same canonical category and delivery rule", () => {
    const rpc = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "queued",
      checkStatusUrl: "https://example.com/payment/pay_1234567890abcdef",
    });

    const http = HttpPaymentStatusResponseSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "queued",
      checkStatusUrl: "/api/payment-status/pay_1234567890abcdef",
    });

    expect(PAYMENT_STATE_TO_CATEGORY[rpc.status]).toBe("in-flight");
    expect(PAYMENT_STATE_TO_CATEGORY[http.status]).toBe("in-flight");
    expect(PAYMENT_STATE_DEFAULT_DELIVERY[rpc.status]).toBe(false);
    expect(PAYMENT_STATE_DEFAULT_DELIVERY[http.status]).toBe(false);
    expect(rpc.checkStatusUrl).toBe("https://example.com/payment/pay_1234567890abcdef");
    expect(http.checkStatusUrl).toBe("/api/payment-status/pay_1234567890abcdef");
  });

  it("keeps terminal failures terminal across rpc and http polling shapes", () => {
    const rpc = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "expired",
      error: "Payment expired",
    });

    const http = HttpPaymentStatusResponseSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "expired",
      error: "Payment expired",
    });

    expect(PAYMENT_STATE_TO_CATEGORY[rpc.status]).toBe("terminal-failure");
    expect(PAYMENT_STATE_TO_CATEGORY[http.status]).toBe("terminal-failure");
    expect(PAYMENT_STATE_DEFAULT_DELIVERY[rpc.status]).toBe(false);
    expect(PAYMENT_STATE_DEFAULT_DELIVERY[http.status]).toBe(false);
    expect(rpc.terminalReason).toBe(http.terminalReason);
  });

  it("keeps canonical not_found identity-gone semantics aligned across rpc and http", () => {
    const rpc = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "unknown_payment_identity",
      error: "Payment identity is gone",
    });

    const http = HttpPaymentStatusResponseSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "unknown_payment_identity",
      error: "Payment identity is gone",
    });

    expect(TERMINAL_REASON_TO_STATE[rpc.terminalReason!]).toBe("not_found");
    expect(TERMINAL_REASON_TO_STATE[http.terminalReason!]).toBe("not_found");
    expect(TERMINAL_REASON_CATEGORY_HANDLING.identity.clientAction).toBe(
      "restart-higher-level-flow-with-new-payment-identity",
    );
    expect(CANONICAL_POLLING_IDENTITY_FIELDS).toEqual(["paymentId", "checkStatusUrl"]);
  });

  it("keeps expired not_found semantics aligned across rpc and http", () => {
    const rpc = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "expired",
      error: "Payment expired",
    });

    const http = HttpPaymentStatusResponseSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "not_found",
      terminalReason: "expired",
      error: "Payment expired",
    });

    expect(TERMINAL_REASON_TO_STATE[rpc.terminalReason!]).toBe("not_found");
    expect(TERMINAL_REASON_TO_STATE[http.terminalReason!]).toBe("not_found");
    expect(TERMINAL_REASON_CATEGORY_HANDLING.identity.clientAction).toBe(
      "restart-higher-level-flow-with-new-payment-identity",
    );
  });
});

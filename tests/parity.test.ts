import { describe, expect, it } from "vitest";
import {
  HttpPaymentStatusResponseSchema,
  PAYMENT_STATE_DEFAULT_DELIVERY,
  PAYMENT_STATE_TO_CATEGORY,
  RpcCheckPaymentResultSchema,
} from "../src/index.js";

describe("rpc/http semantic parity", () => {
  it("maps equivalent in-flight statuses onto the same canonical category and delivery rule", () => {
    const rpc = RpcCheckPaymentResultSchema.parse({
      paymentId: "pay_1234567890abcdef",
      status: "queued",
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
});

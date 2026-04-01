import { describe, expect, it } from "vitest";
import {
  CanonicalDomainBoundary,
  PaymentIdSchema,
  PaymentStateCategoryByState,
  PaymentStatusSchema,
  ProtectedResourceDeliverableStateSchema,
  TerminalReasonSchema,
  TERMINAL_REASON_TO_STATE,
} from "../src/index.js";

describe("core payment semantics", () => {
  it("keeps canonical categories aligned to payment states", () => {
    expect(PaymentStateCategoryByState.requires_payment).toBe("pre-payment");
    expect(PaymentStateCategoryByState.mempool).toBe("in-flight");
    expect(PaymentStateCategoryByState.confirmed).toBe("terminal-success");
    expect(PaymentStateCategoryByState.failed).toBe("terminal-failure");
    expect(PaymentStateCategoryByState.replaced).toBe("terminal-failure");
    expect(PaymentStateCategoryByState.not_found).toBe("terminal-failure");
  });

  it("accepts relay payment ids and rejects arbitrary identifiers", () => {
    expect(PaymentIdSchema.safeParse("pay_01JMVP9QE8XA3BDGM5RN7KWTZ4").success).toBe(true);
    expect(PaymentIdSchema.safeParse("abc123").success).toBe(false);
  });

  it("rejects mismatched payment state and category combinations", () => {
    const result = PaymentStatusSchema.safeParse({
      state: "confirmed",
      category: "in-flight",
      paymentId: "pay_123",
    });

    expect(result.success).toBe(false);
  });

  it("only allows protected resource delivery by default on confirmed", () => {
    expect(ProtectedResourceDeliverableStateSchema.parse("confirmed")).toBe("confirmed");
    expect(() => ProtectedResourceDeliverableStateSchema.parse("mempool")).toThrow();
    expect(CanonicalDomainBoundary.defaultProtectedResourceDelivery.defaultRule).toBe(
      "deliver-only-on-confirmed",
    );
  });

  it("maps terminal reasons into the documented terminal states", () => {
    expect(TERMINAL_REASON_TO_STATE.invalid_transaction).toBe("failed");
    expect(TerminalReasonSchema.parse("queue_unavailable")).toBe("queue_unavailable");
    expect(TERMINAL_REASON_TO_STATE.nonce_replacement).toBe("replaced");
    expect(TERMINAL_REASON_TO_STATE.expired).toBe("not_found");
  });
});

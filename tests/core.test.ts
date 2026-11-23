import { describe, expect, it } from "vitest";
import {
  CANONICAL_POLLING_IDENTITY_FIELDS,
  CanonicalDomainBoundary,
  PaymentIdSchema,
  PaymentStateSchema,
  PaymentStateCategoryByState,
  PaymentStatusSchema,
  ProtectedResourceDeliverableStateSchema,
  RELAY_LIFECYCLE_BRIDGE,
  TERMINAL_REASON_CATEGORY_HANDLING,
  TERMINAL_REASON_HANDLING,
  TERMINAL_REASON_HANDLING_EXCEPTIONS,
  TERMINAL_REASON_TO_CATEGORY,
  TERMINAL_REASONS,
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

  it("rejects the internal-only submitted state from the public contract", () => {
    expect(PaymentStateSchema.safeParse("submitted").success).toBe(false);
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

  it("documents relay-owned payment identity and recovery boundaries", () => {
    expect(CanonicalDomainBoundary.paymentIdentity.owner).toBe("relay");
    expect(CanonicalDomainBoundary.paymentIdentity.field).toBe("paymentId");
    expect(CanonicalDomainBoundary.paymentIdentity.idempotencyInputField).toBe(
      "payment-identifier",
    );
    expect(CanonicalDomainBoundary.paymentIdentity.idempotencyInputRole).toBe(
      "idempotency-input-only",
    );
    expect(CANONICAL_POLLING_IDENTITY_FIELDS).toEqual(["paymentId", "checkStatusUrl"]);
    expect(CanonicalDomainBoundary.pollingIdentity.missingCanonicalIdentityPolicy).toBe(
      "downstream-must-not-invent-paymentId-or-checkStatusUrl",
    );
    expect(CanonicalDomainBoundary.recoveryBoundaries.senderOwned).toContain(
      "transaction rebuild after sender nonce stale/gap",
    );
    expect(CanonicalDomainBoundary.recoveryBoundaries.relayOwned).toContain(
      "payment identity lifecycle",
    );
  });

  it("freezes the required relay lifecycle bridge ordering", () => {
    expect(CanonicalDomainBoundary.relayLifecycleBridgeOrdering).toBe(
      "ordered-transition-sequence",
    );
    expect(RELAY_LIFECYCLE_BRIDGE.map((step) => step.step)).toEqual([
      "sender_hand_accepted",
      "queued_for_sponsor_dispatch",
      "sponsor_broadcasted",
      "confirmed",
      "replaced",
      "terminal_failed",
    ]);
    expect(RELAY_LIFECYCLE_BRIDGE[0]?.callerFacingStates).toEqual(["queued"]);
    expect(RELAY_LIFECYCLE_BRIDGE[2]?.callerFacingStates).toEqual([
      "broadcasting",
      "mempool",
    ]);
  });

  it("documents client handling guidance by terminal reason category", () => {
    expect(TERMINAL_REASON_CATEGORY_HANDLING.sender.clientAction).toBe(
      "rebuild-signed-payment",
    );
    expect(TERMINAL_REASON_CATEGORY_HANDLING.relay.clientAction).toBe(
      "resubmit-same-signed-tx",
    );
    expect(TERMINAL_REASON_CATEGORY_HANDLING.identity.clientAction).toBe(
      "restart-higher-level-flow-with-new-payment-identity",
    );
  });

  // #34: a `failed` record is terminal at the relay. The queue consumer skips it and a
  // resubmission of the same transaction is issued a new paymentId, so recovery can't
  // happen "on the same paymentId". It happens by resubmitting the same signed transaction.
  it.each(["relay", "settlement"] as const)(
    "%s category: the caller resubmits the same signed tx once the paymentId is failed",
    (category) => {
      const { recoveryOwner, clientAction } = TERMINAL_REASON_CATEGORY_HANDLING[category];
      // The relay does not retry a failed paymentId, so it can't be the owner of recovery.
      expect(recoveryOwner).toBe("caller");
      expect(clientAction).toBe("resubmit-same-signed-tx");
    },
  );

  it("no exported clientAction still uses the retired bounded-retry-same-payment token", () => {
    const actions = [
      ...Object.values(TERMINAL_REASON_CATEGORY_HANDLING),
      ...Object.values(TERMINAL_REASON_HANDLING),
    ].map((h) => h.clientAction as string);
    expect(actions).not.toContain("bounded-retry-same-payment");
  });

  it("chain_abort never maps to a resubmit action (nonce already spent)", () => {
    // Still grouped under settlement for reporting, but the per-reason handling overrides it.
    expect(TERMINAL_REASON_TO_CATEGORY.chain_abort).toBe("settlement");
    expect(TERMINAL_REASON_HANDLING.chain_abort.clientAction).toBe("rebuild-signed-payment");
    expect(TERMINAL_REASON_HANDLING.chain_abort.recoveryOwner).toBe("sender");
  });

  it("per-reason handling covers every reason and equals the category default except listed exceptions", () => {
    expect(Object.keys(TERMINAL_REASON_HANDLING).sort()).toEqual([...TERMINAL_REASONS].sort());
    for (const reason of TERMINAL_REASONS) {
      const expected =
        reason in TERMINAL_REASON_HANDLING_EXCEPTIONS
          ? TERMINAL_REASON_HANDLING_EXCEPTIONS[reason as keyof typeof TERMINAL_REASON_HANDLING_EXCEPTIONS]
          : TERMINAL_REASON_CATEGORY_HANDLING[TERMINAL_REASON_TO_CATEGORY[reason]];
      expect(TERMINAL_REASON_HANDLING[reason]).toEqual(expected);
    }
    expect(Object.keys(TERMINAL_REASON_HANDLING_EXCEPTIONS)).toEqual(["chain_abort"]);
  });

  it("only failed reasons, never chain_abort, resolve to a resubmit action", () => {
    const resubmit = TERMINAL_REASONS.filter(
      (reason) => TERMINAL_REASON_HANDLING[reason].clientAction === "resubmit-same-signed-tx",
    );
    expect(resubmit).not.toContain("chain_abort");
    for (const reason of resubmit) {
      expect(TERMINAL_REASON_TO_STATE[reason]).toBe("failed");
    }
  });
});

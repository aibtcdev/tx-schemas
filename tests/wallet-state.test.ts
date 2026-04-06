import { describe, expect, it } from "vitest";
import {
  NodeBroadcastOutcomeSchema,
  HiroTxStatusSchema,
  BroadcastResponsibilitySchema,
  WalletCapacitySchema,
  OccupiedNonceSchema,
  SponsorPoolStateSchema,
  SenderFrontierSchema,
  SenderQueueEntrySchema,
  SenderQueueStateSchema,
  STACKS_NODE_CHAINING_LIMIT,
  RELAY_CHAINING_LIMIT,
  MEMPOOL_TX_MAX_AGE_SECONDS,
  MEMPOOL_TX_MAX_AGE_BLOCKS,
  SENDER_HAND_EXPIRY_MS,
  BLACKLIST_TIMEOUT_SECONDS,
  MAX_RBF_ATTEMPTS,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("wallet constants", () => {
  it("matches documented stacks-core and relay values", () => {
    expect(STACKS_NODE_CHAINING_LIMIT).toBe(25);
    expect(RELAY_CHAINING_LIMIT).toBe(20);
    expect(MEMPOOL_TX_MAX_AGE_SECONDS).toBe(256 * 10 * 60);
    expect(MEMPOOL_TX_MAX_AGE_BLOCKS).toBe(256);
    expect(SENDER_HAND_EXPIRY_MS).toBe(900_000);
    expect(BLACKLIST_TIMEOUT_SECONDS).toBe(172_800);
    expect(MAX_RBF_ATTEMPTS).toBe(3);
  });

  it("relay limit is less than node limit", () => {
    expect(RELAY_CHAINING_LIMIT).toBeLessThan(STACKS_NODE_CHAINING_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// NodeBroadcastOutcome
// ---------------------------------------------------------------------------

describe("NodeBroadcastOutcomeSchema", () => {
  it("accepts a successful broadcast", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({ outcome: "accepted" });
    expect(result.success).toBe(true);
  });

  it("parses nonce_conflict with isOrigin=true (sender problem)", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "nonce_conflict",
      isOrigin: true,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.outcome === "nonce_conflict") {
      expect(result.data.isOrigin).toBe(true);
    }
  });

  it("parses nonce_conflict with isOrigin=false (sponsor problem)", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "nonce_conflict",
      isOrigin: false,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.outcome === "nonce_conflict") {
      expect(result.data.isOrigin).toBe(false);
    }
  });

  it("requires isOrigin on nonce_conflict", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "nonce_conflict",
    });
    expect(result.success).toBe(false);
  });

  it("parses chaining_limit with full detail", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "chaining_limit",
      isOrigin: true,
      maxNonce: 50,
      actualNonce: 51,
      principal: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.outcome === "chaining_limit") {
      expect(result.data.isOrigin).toBe(true);
    }
  });

  it("requires isOrigin on chaining_limit", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "chaining_limit",
      maxNonce: 50,
      actualNonce: 51,
      principal: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
    });
    expect(result.success).toBe(false);
  });

  it("parses fee_too_low with amounts", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "fee_too_low",
      required: "1000",
      actual: "500",
    });
    expect(result.success).toBe(true);
  });

  it("parses insufficient_funds with amounts", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "insufficient_funds",
      required: "5000000",
      available: "1000000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown outcome variants", () => {
    const result = NodeBroadcastOutcomeSchema.safeParse({
      outcome: "ghost_degraded",
    });
    expect(result.success).toBe(false);
  });

  it("discriminates between all outcome types", () => {
    const outcomes = [
      { outcome: "accepted" },
      { outcome: "nonce_conflict", isOrigin: false },
      { outcome: "chaining_limit", isOrigin: true, maxNonce: 25, actualNonce: 26, principal: "SP1X" },
      { outcome: "nonce_too_low" },
      { outcome: "fee_too_low", required: "100", actual: "50" },
      { outcome: "insufficient_funds", required: "100", available: "50" },
      { outcome: "invalid_transaction", reason: "BadFunctionArgument" },
      { outcome: "rate_limited" },
      { outcome: "server_error", reason: "DBError" },
      { outcome: "temporarily_blacklisted" },
    ];
    for (const o of outcomes) {
      expect(NodeBroadcastOutcomeSchema.safeParse(o).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// HiroTxStatus
// ---------------------------------------------------------------------------

describe("HiroTxStatusSchema", () => {
  it("parses confirmed status", () => {
    const result = HiroTxStatusSchema.safeParse({
      category: "confirmed",
      status: "success",
      blockHeight: 100,
    });
    expect(result.success).toBe(true);
  });

  it("parses terminal abort statuses", () => {
    for (const status of ["abort_by_response", "abort_by_post_condition"] as const) {
      const result = HiroTxStatusSchema.safeParse({
        category: "terminal",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("parses transient dropped statuses", () => {
    for (const status of [
      "dropped_replace_by_fee",
      "dropped_replace_across_fork",
      "dropped_too_expensive",
      "dropped_stale_garbage_collect",
      "pending",
    ]) {
      const result = HiroTxStatusSchema.safeParse({
        category: "transient",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("parses not_found (404) status", () => {
    const result = HiroTxStatusSchema.safeParse({ category: "not_found" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid terminal statuses", () => {
    const result = HiroTxStatusSchema.safeParse({
      category: "terminal",
      status: "dropped_replace_by_fee",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BroadcastResponsibility
// ---------------------------------------------------------------------------

describe("BroadcastResponsibilitySchema", () => {
  it("parses sender responsibility", () => {
    const result = BroadcastResponsibilitySchema.safeParse({
      responsible: "sender",
      action: "report_to_agent",
      agentErrorCode: "SENDER_NONCE_CONFLICT",
    });
    expect(result.success).toBe(true);
  });

  it("parses sponsor responsibility with skip_nonce", () => {
    const result = BroadcastResponsibilitySchema.safeParse({
      responsible: "sponsor",
      action: "skip_nonce",
    });
    expect(result.success).toBe(true);
  });

  it("parses network retry with delay", () => {
    const result = BroadcastResponsibilitySchema.safeParse({
      responsible: "network",
      action: "retry_after_delay",
      retryAfterMs: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown responsible party", () => {
    const result = BroadcastResponsibilitySchema.safeParse({
      responsible: "relay",
      action: "skip_nonce",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WalletCapacity
// ---------------------------------------------------------------------------

describe("WalletCapacitySchema", () => {
  function makeWallet(overrides: Record<string, unknown> = {}) {
    return {
      walletIndex: 0,
      sponsorAddress: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
      chainFrontier: 100,
      assignmentHead: 105,
      inFlightCount: 5,
      chainingLimit: RELAY_CHAINING_LIMIT,
      available: RELAY_CHAINING_LIMIT - 5,
      occupiedNonces: [],
      recentFailures: 0,
      recentFailureWindow: 600_000,
      ...overrides,
    };
  }

  it("parses a healthy wallet", () => {
    const result = WalletCapacitySchema.safeParse(makeWallet());
    expect(result.success).toBe(true);
  });

  it("available = chainingLimit - inFlightCount", () => {
    const wallet = makeWallet({ inFlightCount: 8, available: 12 });
    const result = WalletCapacitySchema.safeParse(wallet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(result.data.chainingLimit - result.data.inFlightCount);
    }
  });

  it("accepts a fully exhausted wallet (available=0)", () => {
    const wallet = makeWallet({
      inFlightCount: RELAY_CHAINING_LIMIT,
      available: 0,
    });
    const result = WalletCapacitySchema.safeParse(wallet);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(0);
    }
  });

  it("occupied nonces do not reduce wallet-level availability", () => {
    const occupied = {
      nonce: 102,
      conflictedAt: "2026-04-06T10:00:00.000Z",
      occupantVisible: false,
      rbfAttempts: 1,
      maxRbfAttempts: MAX_RBF_ATTEMPTS,
      abandonAfter: "2026-04-08T04:40:00.000Z",
    };
    const wallet = makeWallet({
      inFlightCount: 1,
      available: 19,
      occupiedNonces: [occupied],
    });
    const result = WalletCapacitySchema.safeParse(wallet);
    expect(result.success).toBe(true);
    if (result.success) {
      // 1 occupied nonce, 19 available — not 0
      expect(result.data.available).toBe(19);
      expect(result.data.occupiedNonces).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// OccupiedNonce
// ---------------------------------------------------------------------------

describe("OccupiedNonceSchema", () => {
  it("parses a ghost nonce (occupantVisible=false)", () => {
    const result = OccupiedNonceSchema.safeParse({
      nonce: 732,
      conflictedAt: "2026-04-06T10:04:00.000Z",
      occupantVisible: false,
      rbfAttempts: 0,
      maxRbfAttempts: MAX_RBF_ATTEMPTS,
      abandonAfter: "2026-04-08T04:44:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("parses a visible occupant nonce", () => {
    const result = OccupiedNonceSchema.safeParse({
      nonce: 59,
      conflictedAt: "2026-04-06T09:42:00.000Z",
      occupantVisible: true,
      rbfAttempts: 2,
      maxRbfAttempts: MAX_RBF_ATTEMPTS,
      abandonAfter: "2026-04-08T04:22:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SponsorPoolState
// ---------------------------------------------------------------------------

describe("SponsorPoolStateSchema", () => {
  it("parses a pool with multiple wallets", () => {
    function makeWallet(index: number, inFlight: number) {
      return {
        walletIndex: index,
        sponsorAddress: `SP${index}ADDR`,
        chainFrontier: 100 + index * 10,
        assignmentHead: 100 + index * 10 + inFlight,
        inFlightCount: inFlight,
        chainingLimit: RELAY_CHAINING_LIMIT,
        available: RELAY_CHAINING_LIMIT - inFlight,
        occupiedNonces: [],
        recentFailures: 0,
        recentFailureWindow: 600_000,
      };
    }

    const pool = {
      walletCount: 3,
      wallets: [makeWallet(0, 5), makeWallet(1, 3), makeWallet(2, 0)],
      totalAvailable: (RELAY_CHAINING_LIMIT - 5) + (RELAY_CHAINING_LIMIT - 3) + RELAY_CHAINING_LIMIT,
      totalInFlight: 8,
      totalCapacity: 3 * RELAY_CHAINING_LIMIT,
      lastReconciliationAt: "2026-04-06T13:00:00.000Z",
      gapsFilled: 1756,
    };

    const result = SponsorPoolStateSchema.safeParse(pool);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalAvailable).toBe(52);
      expect(result.data.totalInFlight).toBe(8);
      expect(result.data.totalCapacity).toBe(60);
    }
  });

  it("accepts a zero-wallet pool (startup/misconfiguration)", () => {
    const pool = {
      walletCount: 0,
      wallets: [],
      totalAvailable: 0,
      totalInFlight: 0,
      totalCapacity: 0,
      lastReconciliationAt: "2026-04-06T13:00:00.000Z",
      gapsFilled: 0,
    };
    const result = SponsorPoolStateSchema.safeParse(pool);
    expect(result.success).toBe(true);
  });

  it("accepts lastGapDetected when present", () => {
    const pool = {
      walletCount: 1,
      wallets: [
        {
          walletIndex: 0,
          sponsorAddress: "SP0ADDR",
          chainFrontier: 100,
          assignmentHead: 100,
          inFlightCount: 0,
          chainingLimit: RELAY_CHAINING_LIMIT,
          available: RELAY_CHAINING_LIMIT,
          occupiedNonces: [],
          recentFailures: 0,
          recentFailureWindow: 600_000,
        },
      ],
      totalAvailable: RELAY_CHAINING_LIMIT,
      totalInFlight: 0,
      totalCapacity: RELAY_CHAINING_LIMIT,
      lastReconciliationAt: "2026-04-06T13:00:00.000Z",
      lastGapDetected: "2026-04-06T10:32:32.935Z",
      gapsFilled: 1756,
    };
    const result = SponsorPoolStateSchema.safeParse(pool);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastGapDetected).toBe("2026-04-06T10:32:32.935Z");
    }
  });
});

// ---------------------------------------------------------------------------
// SenderFrontier
// ---------------------------------------------------------------------------

describe("SenderFrontierSchema", () => {
  it("parses a current frontier seeded from hiro", () => {
    const result = SenderFrontierSchema.safeParse({
      address: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
      nextExpectedNonce: 42,
      seededFrom: "hiro",
      lastRefreshAt: "2026-04-06T12:00:00.000Z",
      frontierHealth: "current",
    });
    expect(result.success).toBe(true);
  });

  it("parses a stale frontier with staleSince", () => {
    const result = SenderFrontierSchema.safeParse({
      address: "SP2GHQRCR1RAP3XJBGJD5S5QX4C1J2NC5YZNTJ9EE",
      nextExpectedNonce: 10,
      seededFrom: "transaction",
      lastRefreshAt: null,
      frontierHealth: "stale",
      staleSince: "2026-04-06T11:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null lastRefreshAt for never-refreshed frontiers", () => {
    const result = SenderFrontierSchema.safeParse({
      address: "SP1X",
      nextExpectedNonce: 0,
      seededFrom: "manual",
      lastRefreshAt: null,
      frontierHealth: "divergent",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SenderQueueEntry
// ---------------------------------------------------------------------------

describe("SenderQueueEntrySchema", () => {
  it("parses a held entry with expiryNotified=false", () => {
    const result = SenderQueueEntrySchema.safeParse({
      senderNonce: 5,
      insertedAt: "2026-04-06T10:00:00.000Z",
      expiresAt: "2026-04-06T10:15:00.000Z",
      state: "held",
      expiryNotified: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiryNotified).toBe(false);
    }
  });

  it("parses an expired entry with expiryNotified=true", () => {
    const result = SenderQueueEntrySchema.safeParse({
      senderNonce: 5,
      insertedAt: "2026-04-06T10:00:00.000Z",
      expiresAt: "2026-04-06T10:15:00.000Z",
      state: "expired",
      expiryNotified: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.expiryNotified).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SenderQueueState
// ---------------------------------------------------------------------------

describe("SenderQueueStateSchema", () => {
  const frontier = {
    address: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
    nextExpectedNonce: 10,
    seededFrom: "hiro" as const,
    lastRefreshAt: "2026-04-06T12:00:00.000Z",
    frontierHealth: "current" as const,
  };

  it("parses empty queue", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "empty",
      frontier,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.queueState).toBe("empty");
    }
  });

  it("parses ready queue with gapless run", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "ready",
      frontier,
      entries: [
        {
          senderNonce: 10,
          insertedAt: "2026-04-06T10:00:00.000Z",
          expiresAt: "2026-04-06T10:15:00.000Z",
          state: "ready",
          expiryNotified: false,
        },
      ],
      gaplessRunLength: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.queueState).toBe("ready");
    }
  });

  it("parses held queue with missing nonces", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "held",
      frontier,
      entries: [
        {
          senderNonce: 12,
          insertedAt: "2026-04-06T10:00:00.000Z",
          expiresAt: "2026-04-06T10:15:00.000Z",
          state: "held",
          expiryNotified: false,
        },
      ],
      missingNonces: [10, 11],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.queueState).toBe("held");
      if (result.data.queueState === "held") {
        expect(result.data.missingNonces).toEqual([10, 11]);
      }
    }
  });

  it("parses dispatching queue", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "dispatching",
      frontier,
      dispatchedEntries: [
        {
          senderNonce: 10,
          insertedAt: "2026-04-06T10:00:00.000Z",
          expiresAt: "2026-04-06T10:15:00.000Z",
          state: "dispatching",
          expiryNotified: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses expired queue with notification tracking", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "expired",
      frontier,
      expiredEntries: [
        {
          senderNonce: 10,
          insertedAt: "2026-04-06T10:00:00.000Z",
          expiresAt: "2026-04-06T10:15:00.000Z",
          state: "expired",
          expiryNotified: false,
        },
      ],
      expiredNonces: [10],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.queueState).toBe("expired");
      if (result.data.queueState === "expired") {
        expect(result.data.expiredEntries[0]!.expiryNotified).toBe(false);
      }
    }
  });

  it("rejects unknown queue state", () => {
    const result = SenderQueueStateSchema.safeParse({
      queueState: "paused",
      frontier,
    });
    expect(result.success).toBe(false);
  });
});

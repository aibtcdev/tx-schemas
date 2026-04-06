import { describe, expect, it } from "vitest";
import {
  // Terminal reasons
  FAILED_TERMINAL_REASONS,
  TERMINAL_REASON_TO_CATEGORY,
  TERMINAL_REASON_TO_STATE,
  TerminalReasonSchema,
  TerminalReasonDetailSchema,

  // RPC error codes
  RPC_ERROR_CODES,
  RpcErrorCodeSchema,

  // RPC diagnostics
  RpcPoolStateSchema,
  RpcWalletCapacitySchema,
  RpcSenderQueueSummarySchema,

  // HTTP nonce state
  HttpNonceStateResponseSchema,

  // Phase 4 schemas (used in test fixtures)
  RELAY_CHAINING_LIMIT,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWallet(index: number, inFlight: number) {
  return {
    walletIndex: index,
    sponsorAddress: `SP${index}TESTADDR`,
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

function makePool() {
  return {
    walletCount: 3,
    wallets: [makeWallet(0, 5), makeWallet(1, 3), makeWallet(2, 0)],
    totalAvailable:
      RELAY_CHAINING_LIMIT - 5 + (RELAY_CHAINING_LIMIT - 3) + RELAY_CHAINING_LIMIT,
    totalInFlight: 8,
    totalCapacity: 3 * RELAY_CHAINING_LIMIT,
    lastReconciliationAt: "2026-04-06T13:00:00.000Z",
    gapsFilled: 1756,
  };
}

const frontier = {
  address: "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T",
  nextExpectedNonce: 10,
  seededFrom: "hiro" as const,
  lastRefreshAt: "2026-04-06T12:00:00.000Z",
  frontierHealth: "current" as const,
};

// ---------------------------------------------------------------------------
// New terminal reasons
// ---------------------------------------------------------------------------

describe("new terminal reasons", () => {
  const newReasons = [
    "sponsor_exhausted",
    "sponsor_nonce_conflict",
    "origin_chaining_limit",
    "broadcast_rate_limited",
    "sender_hand_expired",
  ] as const;

  it("all new reasons are in FAILED_TERMINAL_REASONS", () => {
    for (const reason of newReasons) {
      expect(FAILED_TERMINAL_REASONS).toContain(reason);
    }
  });

  it("all new reasons parse via TerminalReasonSchema", () => {
    for (const reason of newReasons) {
      const result = TerminalReasonSchema.safeParse(reason);
      expect(result.success).toBe(true);
    }
  });

  it("all new reasons map to 'failed' terminal state", () => {
    for (const reason of newReasons) {
      expect(
        TERMINAL_REASON_TO_STATE[reason as keyof typeof TERMINAL_REASON_TO_STATE],
      ).toBe("failed");
    }
  });

  it("sponsor_exhausted has category relay", () => {
    expect(TERMINAL_REASON_TO_CATEGORY.sponsor_exhausted).toBe("relay");
  });

  it("sponsor_nonce_conflict has category relay", () => {
    expect(TERMINAL_REASON_TO_CATEGORY.sponsor_nonce_conflict).toBe("relay");
  });

  it("origin_chaining_limit has category sender", () => {
    expect(TERMINAL_REASON_TO_CATEGORY.origin_chaining_limit).toBe("sender");
  });

  it("broadcast_rate_limited has category settlement", () => {
    expect(TERMINAL_REASON_TO_CATEGORY.broadcast_rate_limited).toBe("settlement");
  });

  it("sender_hand_expired has category sender", () => {
    expect(TERMINAL_REASON_TO_CATEGORY.sender_hand_expired).toBe("sender");
  });

  it("TerminalReasonDetailSchema accepts new reasons", () => {
    const detail = {
      reason: "sponsor_exhausted",
      category: "relay",
      terminalState: "failed",
      retryable: true,
    };
    const result = TerminalReasonDetailSchema.safeParse(detail);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Responsibility → category consistency
// ---------------------------------------------------------------------------

describe("responsibility to category mapping consistency", () => {
  it("sender-responsibility reasons map to sender category", () => {
    const senderReasons = ["origin_chaining_limit", "sender_hand_expired"] as const;
    for (const reason of senderReasons) {
      expect(TERMINAL_REASON_TO_CATEGORY[reason]).toBe("sender");
    }
  });

  it("sponsor-responsibility reasons map to relay category", () => {
    const sponsorReasons = ["sponsor_exhausted", "sponsor_nonce_conflict"] as const;
    for (const reason of sponsorReasons) {
      expect(TERMINAL_REASON_TO_CATEGORY[reason]).toBe("relay");
    }
  });

  it("network-responsibility reasons map to settlement category", () => {
    const networkReasons = ["broadcast_rate_limited"] as const;
    for (const reason of networkReasons) {
      expect(TERMINAL_REASON_TO_CATEGORY[reason]).toBe("settlement");
    }
  });
});

// ---------------------------------------------------------------------------
// New RPC error codes
// ---------------------------------------------------------------------------

describe("new RPC error codes", () => {
  const newCodes = [
    "SPONSOR_EXHAUSTED",
    "ORIGIN_CHAINING_LIMIT",
    "BROADCAST_RATE_LIMITED",
    "SENDER_HAND_EXPIRED",
    "NONCE_OCCUPIED",
  ] as const;

  it("all new codes are in RPC_ERROR_CODES", () => {
    for (const code of newCodes) {
      expect(RPC_ERROR_CODES).toContain(code);
    }
  });

  it("all new codes parse via RpcErrorCodeSchema", () => {
    for (const code of newCodes) {
      const result = RpcErrorCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown error codes", () => {
    const result = RpcErrorCodeSchema.safeParse("GHOST_DEGRADED");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RPC diagnostics schemas
// ---------------------------------------------------------------------------

describe("RpcPoolStateSchema", () => {
  it("accepts a valid pool state with transport fields", () => {
    const result = RpcPoolStateSchema.safeParse({
      requestId: "req_abc123",
      timestamp: "2026-04-06T13:15:00.000Z",
      pool: makePool(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const result = RpcPoolStateSchema.safeParse({
      timestamp: "2026-04-06T13:15:00.000Z",
      pool: makePool(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing timestamp", () => {
    const result = RpcPoolStateSchema.safeParse({
      requestId: "req_abc123",
      pool: makePool(),
    });
    expect(result.success).toBe(false);
  });
});

describe("RpcWalletCapacitySchema", () => {
  it("accepts a valid single-wallet diagnostic", () => {
    const result = RpcWalletCapacitySchema.safeParse({
      requestId: "req_def456",
      timestamp: "2026-04-06T13:15:00.000Z",
      wallet: makeWallet(0, 5),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a wallet with occupied nonces", () => {
    const wallet = {
      ...makeWallet(4, 1),
      occupiedNonces: [
        {
          nonce: 732,
          conflictedAt: "2026-04-06T10:04:00.000Z",
          occupantVisible: false,
          rbfAttempts: 2,
          maxRbfAttempts: 3,
          abandonAfter: "2026-04-08T04:44:00.000Z",
        },
      ],
    };
    const result = RpcWalletCapacitySchema.safeParse({
      requestId: "req_ghi789",
      timestamp: "2026-04-06T13:15:00.000Z",
      wallet,
    });
    expect(result.success).toBe(true);
  });
});

describe("RpcSenderQueueSummarySchema", () => {
  it("accepts an empty sender queue", () => {
    const result = RpcSenderQueueSummarySchema.safeParse({
      requestId: "req_jkl012",
      timestamp: "2026-04-06T13:15:00.000Z",
      senderQueue: {
        queueState: "empty",
        frontier,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a held sender queue with missing nonces", () => {
    const result = RpcSenderQueueSummarySchema.safeParse({
      requestId: "req_mno345",
      timestamp: "2026-04-06T13:15:00.000Z",
      senderQueue: {
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
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an expired sender queue with notification tracking", () => {
    const result = RpcSenderQueueSummarySchema.safeParse({
      requestId: "req_pqr678",
      timestamp: "2026-04-06T13:15:00.000Z",
      senderQueue: {
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
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HTTP nonce state schema
// ---------------------------------------------------------------------------

describe("HttpNonceStateResponseSchema", () => {
  it("validates a realistic /nonce/state payload", () => {
    const payload = {
      timestamp: "2026-04-06T13:15:00.000Z",
      pool: makePool(),
      senderQueues: [
        {
          queueState: "empty" as const,
          frontier,
        },
        {
          queueState: "held" as const,
          frontier: {
            ...frontier,
            address: "SP2GHQRCR1RAP3XJBGJD5S5QX4C1J2NC5YZNTJ9EE",
            frontierHealth: "stale" as const,
            staleSince: "2026-04-06T11:00:00.000Z",
          },
          entries: [
            {
              senderNonce: 15,
              insertedAt: "2026-04-06T10:00:00.000Z",
              expiresAt: "2026-04-06T10:15:00.000Z",
              state: "held" as const,
              expiryNotified: false,
            },
          ],
          missingNonces: [14],
        },
      ],
      healInProgress: false,
    };

    const result = HttpNonceStateResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pool.walletCount).toBe(3);
      expect(result.data.senderQueues).toHaveLength(2);
      expect(result.data.healInProgress).toBe(false);
    }
  });

  it("accepts empty sender queues array", () => {
    const payload = {
      timestamp: "2026-04-06T13:15:00.000Z",
      pool: makePool(),
      senderQueues: [],
      healInProgress: true,
    };
    const result = HttpNonceStateResponseSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects missing pool", () => {
    const result = HttpNonceStateResponseSchema.safeParse({
      timestamp: "2026-04-06T13:15:00.000Z",
      senderQueues: [],
      healInProgress: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing healInProgress", () => {
    const result = HttpNonceStateResponseSchema.safeParse({
      timestamp: "2026-04-06T13:15:00.000Z",
      pool: makePool(),
      senderQueues: [],
    });
    expect(result.success).toBe(false);
  });
});

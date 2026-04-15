import { describe, expect, it } from "vitest";
import {
  adoptOrphan,
  BroadcastDecisionSchema,
  classifyOccupant,
  decideBroadcast,
  HiroSponsorTxViewSchema,
  MAX_RBF_ATTEMPTS,
  OccupantClassificationSchema,
  quarantine,
  RELAY_CHAINING_LIMIT,
  reconcile,
  SponsorLedgerSchema,
  WalletCapacitySchema,
  type HiroSponsorTxView,
  type SponsorLedger,
  type WalletCapacity,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPONSOR = "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T";
const STRANGER = "SP2STRANGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const TX_OURS =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_FOREIGN =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TX_ORPHAN =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const NOW = new Date("2026-04-15T12:00:00.000Z");

function makeWallet(overrides: Partial<WalletCapacity> = {}): WalletCapacity {
  return WalletCapacitySchema.parse({
    walletIndex: 0,
    sponsorAddress: SPONSOR,
    chainFrontier: 100,
    assignmentHead: 110,
    inFlightCount: 10,
    chainingLimit: RELAY_CHAINING_LIMIT,
    available: RELAY_CHAINING_LIMIT - 10,
    occupiedNonces: [],
    recentFailures: 0,
    recentFailureWindow: 600_000,
    ...overrides,
  });
}

function makeLedger(entries: SponsorLedger["entries"] = {}): SponsorLedger {
  return { sponsorAddress: SPONSOR, entries };
}

function hiroTx(overrides: Partial<HiroSponsorTxView> = {}): HiroSponsorTxView {
  return HiroSponsorTxViewSchema.parse({
    tx_id: TX_OURS,
    sender_address: STRANGER,
    sponsored: true,
    sponsor_address: SPONSOR,
    nonce: 0,
    sponsor_nonce: 105,
    fee_rate: "5000",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// SponsorLedgerSchema — key/nonce drift guard
// ---------------------------------------------------------------------------

describe("SponsorLedgerSchema", () => {
  it("rejects ledgers whose entry nonce disagrees with its record key", () => {
    const result = SponsorLedgerSchema.safeParse({
      sponsorAddress: SPONSOR,
      entries: {
        "104": {
          nonce: 105,
          txId: TX_OURS,
          fee: "5000",
          broadcastAt: NOW.toISOString(),
          rbfAttempts: 0,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyOccupant
// ---------------------------------------------------------------------------

describe("classifyOccupant", () => {
  it("returns untraceable when hiroTx is null", () => {
    const result = classifyOccupant(null, SPONSOR);
    expect(result).toEqual({ kind: "untraceable" });
    expect(OccupantClassificationSchema.parse(result)).toEqual(result);
  });

  it("classifies our sponsor-owned tx as in-ledger when it matches", () => {
    const ledger = makeLedger({
      "105": {
        nonce: 105,
        txId: TX_OURS,
        fee: "5000",
        broadcastAt: NOW.toISOString(),
        rbfAttempts: 1,
      },
    });
    const result = classifyOccupant(hiroTx(), SPONSOR, ledger, 105);
    expect(result.kind).toBe("sponsor_owned_in_ledger");
    if (result.kind === "sponsor_owned_in_ledger") {
      expect(result.ledgerEntry.txId).toBe(TX_OURS);
    }
  });

  it("classifies sponsor-owned tx without ledger match as orphan", () => {
    const result = classifyOccupant(hiroTx(), SPONSOR, makeLedger(), 105);
    expect(result.kind).toBe("sponsor_owned_orphan");
  });

  it("classifies a foreign sponsor's tx as foreign", () => {
    const result = classifyOccupant(
      hiroTx({ sponsor_address: STRANGER }),
      SPONSOR
    );
    expect(result.kind).toBe("foreign");
    if (result.kind === "foreign") {
      expect(result.occupantAddress).toBe(STRANGER);
    }
  });

  it("classifies an un-sponsored tx as foreign", () => {
    const result = classifyOccupant(
      hiroTx({ sponsored: false, sponsor_address: undefined }),
      SPONSOR
    );
    expect(result.kind).toBe("foreign");
  });

  it("attributes foreign sponsored txs to the other sponsor, not the sender", () => {
    const otherSponsor = "SP3OTHERSPONSORXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const result = classifyOccupant(
      hiroTx({ sponsor_address: otherSponsor, sender_address: STRANGER }),
      SPONSOR
    );
    expect(result.kind).toBe("foreign");
    if (result.kind === "foreign") {
      expect(result.occupantAddress).toBe(otherSponsor);
    }
  });
});

// ---------------------------------------------------------------------------
// decideBroadcast workflow cases (from issue #22 acceptance criteria)
// ---------------------------------------------------------------------------

describe("decideBroadcast", () => {
  it("sponsor-owned in-ledger conflict → RBF with occupant_fee + 1", () => {
    const ledger = makeLedger({
      "105": {
        nonce: 105,
        txId: TX_OURS,
        fee: "5000",
        broadcastAt: NOW.toISOString(),
        rbfAttempts: 1,
      },
    });
    const occupant = classifyOccupant(hiroTx(), SPONSOR, ledger, 105);
    const decision = decideBroadcast(
      makeWallet({ occupiedNonces: [] }),
      { outcome: "nonce_conflict", isOrigin: false },
      { nonce: 105, ledger, occupant }
    );
    expect(decision).toEqual({ kind: "rbf_with_fee", nonce: 105, fee: "5001" });
    expect(BroadcastDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("sponsor-owned orphan → adopt_then_rbf", () => {
    const ledger = makeLedger();
    const occupant = classifyOccupant(
      hiroTx({ tx_id: TX_ORPHAN, fee_rate: "7000" }),
      SPONSOR,
      ledger,
      105
    );
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "nonce_conflict", isOrigin: false },
      { nonce: 105, ledger, occupant }
    );
    expect(decision).toEqual({
      kind: "adopt_then_rbf",
      nonce: 105,
      orphanTxId: TX_ORPHAN,
      fee: "7001",
    });
  });

  it("foreign occupant at sponsor nonce → quarantine", () => {
    const ledger = makeLedger();
    const occupant = classifyOccupant(
      hiroTx({
        tx_id: TX_FOREIGN,
        sponsored: false,
        sponsor_address: undefined,
        sender_address: STRANGER,
      }),
      SPONSOR,
      ledger,
      105
    );
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "nonce_conflict", isOrigin: false },
      { nonce: 105, ledger, occupant }
    );
    expect(decision).toEqual({
      kind: "quarantine",
      nonce: 105,
      reason: "foreign_occupant",
    });
  });

  it("ghost (occupantVisible=false, hiro not_found) → untraceable quarantine", () => {
    const occupant = classifyOccupant(null, SPONSOR);
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "nonce_conflict", isOrigin: false },
      { nonce: 105, ledger: makeLedger(), occupant }
    );
    expect(decision).toEqual({
      kind: "quarantine",
      nonce: 105,
      reason: "untraceable",
    });
  });

  it("fee_too_low → re-bid at required fee; attempt counter comes from caller state", () => {
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "fee_too_low", required: "8000", actual: "5000" },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({ kind: "rbf_with_fee", nonce: 105, fee: "8000" });
  });

  it("fee_too_low past max RBF attempts → quarantine", () => {
    const wallet = makeWallet({
      occupiedNonces: [
        {
          nonce: 105,
          conflictedAt: NOW.toISOString(),
          occupantVisible: true,
          rbfAttempts: MAX_RBF_ATTEMPTS,
          maxRbfAttempts: MAX_RBF_ATTEMPTS,
          abandonAfter: NOW.toISOString(),
        },
      ],
    });
    const decision = decideBroadcast(
      wallet,
      { outcome: "fee_too_low", required: "8000", actual: "5000" },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({
      kind: "quarantine",
      nonce: 105,
      reason: "rbf_max_attempts",
    });
  });

  it("rbf_max_attempts_reached (via nonce_conflict) → quarantine + head advance", () => {
    const wallet = makeWallet({
      occupiedNonces: [
        {
          nonce: 105,
          conflictedAt: NOW.toISOString(),
          occupantVisible: true,
          rbfAttempts: MAX_RBF_ATTEMPTS,
          maxRbfAttempts: MAX_RBF_ATTEMPTS,
          abandonAfter: NOW.toISOString(),
        },
      ],
    });
    const decision = decideBroadcast(
      wallet,
      { outcome: "nonce_conflict", isOrigin: false },
      {
        nonce: 105,
        ledger: makeLedger(),
        occupant: { kind: "sponsor_owned_orphan", txId: TX_ORPHAN },
      }
    );
    expect(decision.kind).toBe("quarantine");
    if (decision.kind === "quarantine") {
      expect(decision.reason).toBe("rbf_max_attempts");
    }
  });

  it("origin nonce_conflict → terminal (sender is broken)", () => {
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "nonce_conflict", isOrigin: true },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({
      kind: "terminal",
      reason: "sender_nonce_stale",
    });
  });

  it("accepted → first_broadcast", () => {
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "accepted" },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({ kind: "first_broadcast", nonce: 105 });
  });

  it("origin chaining_limit → terminal", () => {
    const decision = decideBroadcast(
      makeWallet(),
      {
        outcome: "chaining_limit",
        isOrigin: true,
        maxNonce: 25,
        actualNonce: 26,
        principal: STRANGER,
      },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({ kind: "terminal", reason: "origin_chaining_limit" });
  });

  it("sponsor chaining_limit → sponsor_exhausted", () => {
    const decision = decideBroadcast(
      makeWallet(),
      {
        outcome: "chaining_limit",
        isOrigin: false,
        maxNonce: 25,
        actualNonce: 26,
        principal: SPONSOR,
      },
      { nonce: 105, ledger: makeLedger() }
    );
    expect(decision).toEqual({ kind: "terminal", reason: "sponsor_exhausted" });
  });
});

// ---------------------------------------------------------------------------
// adoptOrphan
// ---------------------------------------------------------------------------

describe("adoptOrphan", () => {
  it("adds an occupied-nonce entry marking the orphan as ours", () => {
    const wallet = makeWallet();
    const next = adoptOrphan(
      wallet,
      hiroTx({ tx_id: TX_ORPHAN, fee_rate: "7000" }),
      { now: NOW }
    );
    expect(next.occupiedNonces).toHaveLength(1);
    const entry = next.occupiedNonces[0]!;
    expect(entry.nonce).toBe(105);
    expect(entry.occupantVisible).toBe(true);
    expect(entry.lastOccupant?.txId).toBe(TX_ORPHAN);
    expect(entry.lastOccupant?.fee).toBe("7000");
  });

  it("updates an existing occupied-nonce entry in place", () => {
    const wallet = makeWallet({
      occupiedNonces: [
        {
          nonce: 105,
          conflictedAt: NOW.toISOString(),
          occupantVisible: false,
          rbfAttempts: 2,
          maxRbfAttempts: MAX_RBF_ATTEMPTS,
          abandonAfter: NOW.toISOString(),
        },
      ],
    });
    const next = adoptOrphan(wallet, hiroTx({ tx_id: TX_ORPHAN }), { now: NOW });
    expect(next.occupiedNonces).toHaveLength(1);
    expect(next.occupiedNonces[0]!.occupantVisible).toBe(true);
    expect(next.occupiedNonces[0]!.rbfAttempts).toBe(2);
  });

  it("is a no-op when nonce cannot be determined", () => {
    const wallet = makeWallet();
    const next = adoptOrphan(
      wallet,
      hiroTx({ nonce: undefined, sponsor_nonce: undefined })
    );
    expect(next).toBe(wallet);
  });
});

// ---------------------------------------------------------------------------
// quarantine
// ---------------------------------------------------------------------------

describe("quarantine", () => {
  it("records the slot, removes occupied entry, advances possibleNextNonce", () => {
    const wallet = makeWallet({
      chainFrontier: 100,
      assignmentHead: 105,
      inFlightCount: 5,
      available: RELAY_CHAINING_LIMIT - 5,
      occupiedNonces: [
        {
          nonce: 105,
          conflictedAt: NOW.toISOString(),
          occupantVisible: true,
          rbfAttempts: MAX_RBF_ATTEMPTS,
          maxRbfAttempts: MAX_RBF_ATTEMPTS,
          abandonAfter: NOW.toISOString(),
        },
      ],
    });
    const next = quarantine(
      wallet,
      105,
      "rbf_max_attempts",
      { txId: TX_FOREIGN },
      NOW
    );
    expect(next.occupiedNonces).toHaveLength(0);
    expect(next.quarantinedNonces).toHaveLength(1);
    expect(next.quarantinedNonces?.[0]).toMatchObject({
      nonce: 105,
      reason: "rbf_max_attempts",
      lastOccupant: { txId: TX_FOREIGN },
    });
    expect(next.possibleNextNonce).toBe(106);
  });

  it("skips past consecutive quarantined nonces", () => {
    let wallet = makeWallet({
      assignmentHead: 110,
      chainFrontier: 100,
      inFlightCount: 10,
      available: RELAY_CHAINING_LIMIT - 10,
    });
    wallet = quarantine(wallet, 110, "foreign_occupant", undefined, NOW);
    wallet = quarantine(wallet, 111, "foreign_occupant", undefined, NOW);
    expect(wallet.possibleNextNonce).toBe(112);
  });

  it("is idempotent for the same nonce", () => {
    let wallet = makeWallet();
    wallet = quarantine(wallet, 110, "foreign_occupant", undefined, NOW);
    const again = quarantine(wallet, 110, "foreign_occupant", undefined, NOW);
    expect(again.quarantinedNonces).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// reconcile — orphans adopted, missing entries flagged
// ---------------------------------------------------------------------------

describe("reconcile", () => {
  it("adopts orphans seen in the mempool and flags ledger entries that disappeared", () => {
    const ledger = makeLedger({
      "104": {
        nonce: 104,
        txId: TX_OURS,
        fee: "5000",
        broadcastAt: NOW.toISOString(),
        rbfAttempts: 0,
      },
    });
    const wallet = makeWallet();

    const mempool: Record<number, HiroSponsorTxView | null> = {
      104: null,
      105: hiroTx({ tx_id: TX_ORPHAN, fee_rate: "7000" }),
    };

    const result = reconcile(wallet, ledger, mempool, SPONSOR, { now: NOW });
    expect(result.adopted).toEqual([105]);
    expect(result.dropped).toEqual([104]);
    expect(result.ledger.entries["105"]?.txId).toBe(TX_ORPHAN);
    expect(result.wallet.occupiedNonces.map((n) => n.nonce)).toContain(105);
  });

  it("flags ledger drift when mempool tx_id differs from ledger", () => {
    const ledger = makeLedger({
      "104": {
        nonce: 104,
        txId: TX_OURS,
        fee: "5000",
        broadcastAt: NOW.toISOString(),
        rbfAttempts: 0,
      },
    });
    const mempool: Record<number, HiroSponsorTxView | null> = {
      104: hiroTx({ tx_id: TX_ORPHAN, sponsor_nonce: 104 }),
    };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.dropped).toContain(104);
  });

  it("ignores foreign tx_ids at a sponsor nonce (classified by classifyOccupant)", () => {
    const mempool: Record<number, HiroSponsorTxView | null> = {
      105: hiroTx({
        sponsored: false,
        sponsor_address: undefined,
        sender_address: STRANGER,
      }),
    };
    const result = reconcile(makeWallet(), makeLedger(), mempool, SPONSOR, {
      now: NOW,
    });
    expect(result.adopted).toEqual([]);
    expect(result.unpriceableOrphans).toEqual([]);
  });

  it("reports unpriceable orphans rather than adopting at a sentinel fee", () => {
    const mempool: Record<number, HiroSponsorTxView | null> = {
      105: hiroTx({ tx_id: TX_ORPHAN, fee_rate: undefined }),
    };
    const result = reconcile(makeWallet(), makeLedger(), mempool, SPONSOR, {
      now: NOW,
    });
    expect(result.adopted).toEqual([]);
    expect(result.unpriceableOrphans).toEqual([105]);
    expect(result.ledger.entries["105"]).toBeUndefined();
  });
});

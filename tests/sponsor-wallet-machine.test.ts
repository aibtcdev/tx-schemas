import { describe, expect, it } from "vitest";
import {
  adoptOrphan,
  beginPendingBroadcast,
  BroadcastDecisionSchema,
  classifyOccupant,
  decideBroadcast,
  HiroSponsorTxViewSchema,
  LedgerTransitionError,
  MAX_RBF_ATTEMPTS,
  OccupantClassificationSchema,
  quarantine,
  RELAY_CHAINING_LIMIT,
  reconcile,
  resolveBroadcast,
  SponsorLedgerSchema,
  WalletCapacitySchema,
  type HiroSponsorTxView,
  type SponsorLedger,
  type SponsorLedgerEntry,
  type WalletCapacity,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SPONSOR = "SP1KGHF33Y4M7Q87WNRXQBCAP2Y6DBSQSHJHQH4T";
const STRANGER = "SP2STRANGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const TX_OURS =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TX_OURS_2 =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
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

function makeEntry(overrides: Partial<SponsorLedgerEntry> = {}): SponsorLedgerEntry {
  return {
    nonce: 105,
    txId: TX_OURS,
    fee: "5000",
    status: "broadcast_sent",
    broadcastAt: NOW.toISOString(),
    rbfAttempts: 0,
    ...overrides,
  };
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
// SponsorLedgerSchema — key/nonce drift guard + required status
// ---------------------------------------------------------------------------

describe("SponsorLedgerSchema", () => {
  it("rejects ledgers whose entry nonce disagrees with its record key", () => {
    const result = SponsorLedgerSchema.safeParse({
      sponsorAddress: SPONSOR,
      entries: {
        "104": makeEntry({ nonce: 105 }),
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects ledger entries that omit status", () => {
    const { status: _status, ...rest } = makeEntry();
    const result = SponsorLedgerSchema.safeParse({
      sponsorAddress: SPONSOR,
      entries: { "105": rest },
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
      "105": makeEntry({ rbfAttempts: 1 }),
    });
    const result = classifyOccupant(hiroTx(), SPONSOR, ledger, 105);
    expect(result.kind).toBe("sponsor_owned_in_ledger");
    if (result.kind === "sponsor_owned_in_ledger") {
      expect(result.ledgerEntry.txId).toBe(TX_OURS);
      expect(result.ledgerEntry.status).toBe("broadcast_sent");
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
// decideBroadcast workflow cases
// ---------------------------------------------------------------------------

describe("decideBroadcast", () => {
  it("sponsor-owned in-ledger conflict → RBF with occupant_fee + 1", () => {
    const ledger = makeLedger({ "105": makeEntry({ rbfAttempts: 1 }) });
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

  it("returns await_pending_broadcast when the ledger entry is unresolved", () => {
    const ledger = makeLedger({
      "105": makeEntry({ status: "pending_broadcast" }),
    });
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "accepted" },
      { nonce: 105, ledger }
    );
    expect(decision).toEqual({
      kind: "await_pending_broadcast",
      nonce: 105,
      txId: TX_OURS,
    });
    expect(BroadcastDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("await_pending_broadcast takes precedence over RBF for a conflict outcome", () => {
    const ledger = makeLedger({
      "105": makeEntry({ status: "pending_broadcast" }),
    });
    const occupant = classifyOccupant(hiroTx(), SPONSOR, ledger, 105);
    const decision = decideBroadcast(
      makeWallet(),
      { outcome: "nonce_conflict", isOrigin: false },
      { nonce: 105, ledger, occupant }
    );
    expect(decision.kind).toBe("await_pending_broadcast");
  });
});

// ---------------------------------------------------------------------------
// Two-phase broadcast lifecycle
// ---------------------------------------------------------------------------

describe("beginPendingBroadcast", () => {
  it("writes a new pending_broadcast entry for a fresh nonce", () => {
    const ledger = beginPendingBroadcast(makeLedger(), {
      nonce: 105,
      txId: TX_OURS,
      fee: "5000",
      broadcastAt: NOW,
    });
    expect(ledger.entries["105"]).toMatchObject({
      nonce: 105,
      txId: TX_OURS,
      fee: "5000",
      status: "pending_broadcast",
      broadcastAt: NOW.toISOString(),
      rbfAttempts: 0,
    });
    expect(SponsorLedgerSchema.parse(ledger)).toEqual(ledger);
  });

  it("allows transition from broadcast_sent (RBF replaces prior entry)", () => {
    const prior = makeLedger({ "105": makeEntry({ rbfAttempts: 2 }) });
    const next = beginPendingBroadcast(prior, {
      nonce: 105,
      txId: TX_OURS_2,
      fee: "6000",
      rbfAttempts: 3,
      broadcastAt: NOW,
    });
    expect(next.entries["105"]?.status).toBe("pending_broadcast");
    expect(next.entries["105"]?.txId).toBe(TX_OURS_2);
    expect(next.entries["105"]?.rbfAttempts).toBe(3);
  });

  it("allows transition from broadcast_failed (retry)", () => {
    const prior = makeLedger({
      "105": makeEntry({ status: "broadcast_failed" }),
    });
    const next = beginPendingBroadcast(prior, {
      nonce: 105,
      txId: TX_OURS_2,
      fee: "6000",
      broadcastAt: NOW,
    });
    expect(next.entries["105"]?.status).toBe("pending_broadcast");
  });

  it("refuses to overwrite an unresolved pending_broadcast entry", () => {
    const prior = makeLedger({
      "105": makeEntry({ status: "pending_broadcast" }),
    });
    expect(() =>
      beginPendingBroadcast(prior, {
        nonce: 105,
        txId: TX_OURS_2,
        fee: "6000",
      })
    ).toThrow(LedgerTransitionError);
  });
});

describe("resolveBroadcast", () => {
  it("transitions pending_broadcast → broadcast_sent", () => {
    const ledger = beginPendingBroadcast(makeLedger(), {
      nonce: 105,
      txId: TX_OURS,
      fee: "5000",
      broadcastAt: NOW,
    });
    const resolved = resolveBroadcast(ledger, 105, "sent");
    expect(resolved.entries["105"]?.status).toBe("broadcast_sent");
  });

  it("transitions pending_broadcast → broadcast_failed", () => {
    const ledger = beginPendingBroadcast(makeLedger(), {
      nonce: 105,
      txId: TX_OURS,
      fee: "5000",
      broadcastAt: NOW,
    });
    const resolved = resolveBroadcast(ledger, 105, "failed", {
      lastOutcome: { outcome: "server_error", reason: "upstream 502" },
    });
    expect(resolved.entries["105"]?.status).toBe("broadcast_failed");
    expect(resolved.entries["105"]?.lastOutcome).toEqual({
      outcome: "server_error",
      reason: "upstream 502",
    });
  });

  it("throws when the entry does not exist", () => {
    expect(() => resolveBroadcast(makeLedger(), 105, "sent")).toThrow(
      LedgerTransitionError
    );
  });

  it("throws when the entry is not pending (no double-resolve)", () => {
    const ledger = makeLedger({ "105": makeEntry() });
    expect(() => resolveBroadcast(ledger, 105, "sent")).toThrow(
      LedgerTransitionError
    );
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
// reconcile — orphans, grace window, pending promotion
// ---------------------------------------------------------------------------

describe("reconcile", () => {
  it("adopts orphans seen in the mempool and flags ledger entries that disappeared", () => {
    const ledger = makeLedger({
      "104": makeEntry({ nonce: 104 }),
    });
    const wallet = makeWallet();

    const mempool: Record<number, HiroSponsorTxView | null> = {
      104: null,
      105: hiroTx({ tx_id: TX_ORPHAN, fee_rate: "7000" }),
    };

    const result = reconcile(wallet, ledger, mempool, SPONSOR, {
      now: new Date(NOW.getTime() + 120_000),
    });
    expect(result.adopted).toEqual([105]);
    expect(result.dropped).toEqual([104]);
    expect(result.inFlightPendingIndex).toEqual([]);
    expect(result.ledger.entries["105"]?.txId).toBe(TX_ORPHAN);
    expect(result.ledger.entries["105"]?.status).toBe("broadcast_sent");
    expect(result.wallet.occupiedNonces.map((n) => n.nonce)).toContain(105);
  });

  it("flags ledger drift when mempool tx_id differs from ledger", () => {
    const ledger = makeLedger({ "104": makeEntry({ nonce: 104 }) });
    const mempool: Record<number, HiroSponsorTxView | null> = {
      104: hiroTx({ tx_id: TX_ORPHAN, sponsor_nonce: 104 }),
    };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, {
      now: new Date(NOW.getTime() + 120_000),
    });
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

  it("promotes pending_broadcast → broadcast_sent when the mempool confirms the txId", () => {
    const ledger = makeLedger({
      "105": makeEntry({ status: "pending_broadcast" }),
    });
    const mempool: Record<number, HiroSponsorTxView | null> = {
      105: hiroTx(),
    };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.ledger.entries["105"]?.status).toBe("broadcast_sent");
  });

  it("classifies inside-grace absences as inFlightPendingIndex, not dropped", () => {
    const broadcastAt = new Date(NOW.getTime() - 10_000); // 10s ago
    const ledger = makeLedger({
      "105": makeEntry({
        status: "pending_broadcast",
        broadcastAt: broadcastAt.toISOString(),
      }),
    });
    const mempool: Record<number, HiroSponsorTxView | null> = { 105: null };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.inFlightPendingIndex).toEqual([105]);
    expect(result.dropped).toEqual([]);
  });

  it("classifies past-grace absences as dropped", () => {
    const broadcastAt = new Date(NOW.getTime() - 60_000); // 60s ago
    const ledger = makeLedger({
      "105": makeEntry({
        status: "pending_broadcast",
        broadcastAt: broadcastAt.toISOString(),
      }),
    });
    const mempool: Record<number, HiroSponsorTxView | null> = { 105: null };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.dropped).toEqual([105]);
    expect(result.inFlightPendingIndex).toEqual([]);
  });

  it("treats txId drift as dropped even within the grace window (drift is not lag)", () => {
    const broadcastAt = new Date(NOW.getTime() - 5_000); // 5s ago, well inside grace
    const ledger = makeLedger({
      "105": makeEntry({
        nonce: 105,
        txId: TX_OURS,
        broadcastAt: broadcastAt.toISOString(),
      }),
    });
    // Mempool reports a *different* sponsor-owned tx at the same nonce.
    const mempool: Record<number, HiroSponsorTxView | null> = {
      105: hiroTx({ tx_id: TX_ORPHAN, fee_rate: "7000" }),
    };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.dropped).toContain(105);
    expect(result.inFlightPendingIndex).toEqual([]);
  });

  it("honors a custom justBroadcastGraceSeconds override", () => {
    const broadcastAt = new Date(NOW.getTime() - 45_000); // 45s ago
    const ledger = makeLedger({
      "105": makeEntry({
        status: "pending_broadcast",
        broadcastAt: broadcastAt.toISOString(),
      }),
    });
    const mempool: Record<number, HiroSponsorTxView | null> = { 105: null };

    const tight = reconcile(makeWallet(), ledger, mempool, SPONSOR, {
      now: NOW,
      justBroadcastGraceSeconds: 30,
    });
    expect(tight.dropped).toEqual([105]);

    const lenient = reconcile(makeWallet(), ledger, mempool, SPONSOR, {
      now: NOW,
      justBroadcastGraceSeconds: 60,
    });
    expect(lenient.inFlightPendingIndex).toEqual([105]);
  });

  it("two-phase happy path end-to-end: begin → reconcile promotes → resolve is a no-op edge case", () => {
    let ledger = beginPendingBroadcast(makeLedger(), {
      nonce: 105,
      txId: TX_OURS,
      fee: "5000",
      broadcastAt: NOW,
    });
    expect(ledger.entries["105"]?.status).toBe("pending_broadcast");

    // Network call returned success — caller resolves explicitly.
    ledger = resolveBroadcast(ledger, 105, "sent");
    expect(ledger.entries["105"]?.status).toBe("broadcast_sent");

    // Mempool later confirms the same txId; no drift, no adopt.
    const mempool: Record<number, HiroSponsorTxView | null> = {
      105: hiroTx(),
    };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.adopted).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(result.inFlightPendingIndex).toEqual([]);
  });

  it("two-phase crash recovery: pending entry older than grace is dropped for caller to inspect", () => {
    // Simulate: beginPendingBroadcast succeeded, process died, entry was
    // never resolved and the tx never reached the node.
    const broadcastAt = new Date(NOW.getTime() - 120_000);
    const ledger = makeLedger({
      "105": makeEntry({
        status: "pending_broadcast",
        broadcastAt: broadcastAt.toISOString(),
      }),
    });
    const mempool: Record<number, HiroSponsorTxView | null> = { 105: null };
    const result = reconcile(makeWallet(), ledger, mempool, SPONSOR, { now: NOW });
    expect(result.dropped).toEqual([105]);
  });
});

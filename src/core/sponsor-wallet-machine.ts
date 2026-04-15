import { z } from "zod";
import type { HiroSponsorTxView } from "./hiro-tx.js";
import type { NodeBroadcastOutcome } from "./nonce-outcome.js";
import {
  AmountStringSchema,
  NonNegativeIntegerSchema,
  StacksAddressSchema,
  TransactionIdSchema,
} from "./primitives.js";
import { getLedgerEntry, SponsorLedgerEntrySchema } from "./sponsor-ledger.js";
import type {
  SponsorLedger,
  SponsorLedgerEntry,
} from "./sponsor-ledger.js";
import { FailedTerminalReasonSchema } from "./terminal-reasons.js";
import { QuarantineReasonSchema } from "./wallet-capacity.js";
import type {
  LastOccupant,
  OccupiedNonce,
  QuarantineReason,
  QuarantinedNonce,
  WalletCapacity,
} from "./wallet-capacity.js";
import { MAX_RBF_ATTEMPTS } from "./wallet-constants.js";

// ---------------------------------------------------------------------------
// OccupantClassification — who owns the tx currently sitting at a nonce
// ---------------------------------------------------------------------------

const SponsorOwnedInLedgerClassificationSchema = z.object({
  kind: z.literal("sponsor_owned_in_ledger"),
  txId: TransactionIdSchema,
  ledgerEntry: SponsorLedgerEntrySchema,
  fee: AmountStringSchema.optional(),
});

const SponsorOwnedOrphanClassificationSchema = z.object({
  kind: z.literal("sponsor_owned_orphan"),
  txId: TransactionIdSchema,
  fee: AmountStringSchema.optional(),
});

const ForeignClassificationSchema = z.object({
  kind: z.literal("foreign"),
  txId: TransactionIdSchema,
  occupantAddress: StacksAddressSchema,
  fee: AmountStringSchema.optional(),
});

const UntraceableClassificationSchema = z.object({
  kind: z.literal("untraceable"),
});

export const OccupantClassificationSchema = z.discriminatedUnion("kind", [
  SponsorOwnedInLedgerClassificationSchema,
  SponsorOwnedOrphanClassificationSchema,
  ForeignClassificationSchema,
  UntraceableClassificationSchema,
]);

export type OccupantClassification = z.infer<typeof OccupantClassificationSchema>;

// ---------------------------------------------------------------------------
// BroadcastDecision — what the relay should do next for a given nonce
// ---------------------------------------------------------------------------

const FirstBroadcastDecisionSchema = z.object({
  kind: z.literal("first_broadcast"),
  nonce: NonNegativeIntegerSchema,
});

const RbfWithFeeDecisionSchema = z.object({
  kind: z.literal("rbf_with_fee"),
  nonce: NonNegativeIntegerSchema,
  fee: AmountStringSchema,
});

const AdoptThenRbfDecisionSchema = z.object({
  kind: z.literal("adopt_then_rbf"),
  nonce: NonNegativeIntegerSchema,
  orphanTxId: TransactionIdSchema,
  fee: AmountStringSchema,
});

const QuarantineDecisionSchema = z.object({
  kind: z.literal("quarantine"),
  nonce: NonNegativeIntegerSchema,
  reason: QuarantineReasonSchema,
});

const TerminalDecisionSchema = z.object({
  kind: z.literal("terminal"),
  reason: FailedTerminalReasonSchema,
});

export const BroadcastDecisionSchema = z.discriminatedUnion("kind", [
  FirstBroadcastDecisionSchema,
  RbfWithFeeDecisionSchema,
  AdoptThenRbfDecisionSchema,
  QuarantineDecisionSchema,
  TerminalDecisionSchema,
]);

export type BroadcastDecision = z.infer<typeof BroadcastDecisionSchema>;

// ---------------------------------------------------------------------------
// classifyOccupant
//
// Reads the identity fields on a Hiro mempool/tx response and decides whether
// the occupant is this sponsor's known tx, this sponsor's unrecorded tx
// (orphan), a foreign sender's tx, or invisible. Pure — no time source.
// ---------------------------------------------------------------------------

export function classifyOccupant(
  hiroTx: HiroSponsorTxView | null | undefined,
  ourSponsorAddress: string,
  ledger?: SponsorLedger,
  nonce?: number
): OccupantClassification {
  if (!hiroTx) return { kind: "untraceable" };

  const txFee = hiroTx.fee_rate;

  if (hiroTx.sponsored && hiroTx.sponsor_address === ourSponsorAddress) {
    const targetNonce = nonce ?? hiroTx.sponsor_nonce ?? hiroTx.nonce;
    if (ledger && targetNonce !== undefined) {
      const entry = getLedgerEntry(ledger, targetNonce);
      if (entry && entry.txId === hiroTx.tx_id) {
        return {
          kind: "sponsor_owned_in_ledger",
          txId: hiroTx.tx_id,
          ledgerEntry: {
            nonce: entry.nonce,
            txId: entry.txId,
            fee: entry.fee,
            broadcastAt: entry.broadcastAt,
            rbfAttempts: entry.rbfAttempts,
          },
          fee: txFee,
        };
      }
    }
    return { kind: "sponsor_owned_orphan", txId: hiroTx.tx_id, fee: txFee };
  }

  return {
    kind: "foreign",
    txId: hiroTx.tx_id,
    // When the foreign tx is sponsored by a different sponsor, the sponsor
    // nonce is held by that sponsor — attribute quarantine/alerts to them,
    // not to the sender.
    occupantAddress: hiroTx.sponsor_address ?? hiroTx.sender_address,
    fee: txFee,
  };
}

// ---------------------------------------------------------------------------
// decideBroadcast
//
// Maps a (walletCapacity, nodeBroadcastOutcome, ledger-for-nonce, occupant)
// tuple to the next action: first broadcast, RBF, adopt-then-RBF, quarantine,
// or terminal. Pure — no I/O, no time source.
// ---------------------------------------------------------------------------

export interface BroadcastContext {
  nonce: number;
  ledger: SponsorLedger;
  occupant?: OccupantClassification;
  // Occupant fee from the latest Hiro observation, if visible. Used to
  // re-bid on fee_too_low. Callers add their bump on top.
  currentOccupantFee?: string;
  maxRbfAttempts?: number;
}

export function decideBroadcast(
  wallet: WalletCapacity,
  outcome: NodeBroadcastOutcome,
  context: BroadcastContext
): BroadcastDecision {
  const { nonce, ledger, occupant } = context;
  const maxAttempts = context.maxRbfAttempts ?? MAX_RBF_ATTEMPTS;
  const ledgerEntry = getLedgerEntry(ledger, nonce);
  const occupied = wallet.occupiedNonces.find((o) => o.nonce === nonce);
  const attempts = occupied?.rbfAttempts ?? ledgerEntry?.rbfAttempts ?? 0;

  switch (outcome.outcome) {
    case "accepted":
      return { kind: "first_broadcast", nonce };

    case "nonce_too_low":
      return { kind: "terminal", reason: "sender_nonce_stale" };

    case "nonce_conflict": {
      if (outcome.isOrigin) {
        return { kind: "terminal", reason: "sender_nonce_stale" };
      }
      return decideSponsorConflict({
        nonce,
        occupant,
        ledgerEntry,
        attempts,
        maxAttempts,
        ...(context.currentOccupantFee !== undefined && {
          currentOccupantFee: context.currentOccupantFee,
        }),
      });
    }

    case "fee_too_low": {
      if (attempts >= maxAttempts) {
        return { kind: "quarantine", nonce, reason: "rbf_max_attempts" };
      }
      return { kind: "rbf_with_fee", nonce, fee: outcome.required };
    }

    case "chaining_limit":
      return outcome.isOrigin
        ? { kind: "terminal", reason: "origin_chaining_limit" }
        : { kind: "terminal", reason: "sponsor_exhausted" };

    case "insufficient_funds":
      return { kind: "terminal", reason: "sponsor_failure" };

    case "invalid_transaction":
      return { kind: "terminal", reason: "invalid_transaction" };

    case "rate_limited":
      return { kind: "terminal", reason: "broadcast_rate_limited" };

    case "server_error":
      return { kind: "terminal", reason: "broadcast_failure" };

    case "temporarily_blacklisted":
      return { kind: "terminal", reason: "broadcast_failure" };
  }
}

function decideSponsorConflict(args: {
  nonce: number;
  occupant: OccupantClassification | undefined;
  ledgerEntry: SponsorLedgerEntry | undefined;
  attempts: number;
  maxAttempts: number;
  currentOccupantFee?: string;
}): BroadcastDecision {
  const { nonce, occupant, ledgerEntry, attempts, maxAttempts, currentOccupantFee } =
    args;

  if (attempts >= maxAttempts) {
    return { kind: "quarantine", nonce, reason: "rbf_max_attempts" };
  }

  if (!occupant) {
    if (ledgerEntry) {
      return { kind: "rbf_with_fee", nonce, fee: bump(ledgerEntry.fee) };
    }
    return { kind: "quarantine", nonce, reason: "untraceable" };
  }

  switch (occupant.kind) {
    case "sponsor_owned_in_ledger":
      return {
        kind: "rbf_with_fee",
        nonce,
        fee: bump(occupant.fee ?? occupant.ledgerEntry.fee),
      };
    case "sponsor_owned_orphan":
      // An orphan we cannot price either from Hiro or caller context would
      // produce a 1-µSTX RBF — guaranteed reject. Quarantine instead so the
      // caller surfaces it rather than silently burning an attempt.
      if (occupant.fee === undefined && currentOccupantFee === undefined) {
        return { kind: "quarantine", nonce, reason: "untraceable" };
      }
      return {
        kind: "adopt_then_rbf",
        nonce,
        orphanTxId: occupant.txId,
        fee: bump(occupant.fee ?? currentOccupantFee!),
      };
    case "foreign":
      return { kind: "quarantine", nonce, reason: "foreign_occupant" };
    case "untraceable":
      return { kind: "quarantine", nonce, reason: "untraceable" };
  }
}

const bump = (fee: string): string => (BigInt(fee) + 1n).toString();

// ---------------------------------------------------------------------------
// adoptOrphan
//
// Folds an unrecorded sponsor-broadcast tx into wallet state. Adds/updates
// the matching occupied-nonce entry with the orphan's metadata so the next
// decision cycle treats it as our own.
// ---------------------------------------------------------------------------

export function adoptOrphan(
  wallet: WalletCapacity,
  hiroTx: HiroSponsorTxView,
  options: { now?: Date; abandonAfter?: string; maxRbfAttempts?: number } = {}
): WalletCapacity {
  const nonce = hiroTx.sponsor_nonce ?? hiroTx.nonce;
  if (nonce === undefined) return wallet;

  const now = (options.now ?? new Date()).toISOString();
  const abandonAfter = options.abandonAfter ?? now;
  const maxRbfAttempts = options.maxRbfAttempts ?? MAX_RBF_ATTEMPTS;
  const lastOccupant: LastOccupant = {
    txId: hiroTx.tx_id,
    address: hiroTx.sponsor_address,
    fee: hiroTx.fee_rate,
    observedAt: now,
  };

  const existing = wallet.occupiedNonces.find((n) => n.nonce === nonce);
  const adopted: OccupiedNonce = existing
    ? { ...existing, occupantVisible: true, lastOccupant }
    : {
        nonce,
        conflictedAt: now,
        occupantVisible: true,
        rbfAttempts: 0,
        maxRbfAttempts,
        abandonAfter,
        lastOccupant,
      };

  const occupiedNonces = existing
    ? wallet.occupiedNonces.map((n) => (n.nonce === nonce ? adopted : n))
    : [...wallet.occupiedNonces, adopted];

  return { ...wallet, occupiedNonces };
}

// ---------------------------------------------------------------------------
// quarantine
//
// Marks a slot unusable and advances possibleNextNonce past it. Removes any
// matching occupied-nonce entry. Idempotent for the same nonce.
// ---------------------------------------------------------------------------

export function quarantine(
  wallet: WalletCapacity,
  nonce: number,
  reason: QuarantineReason,
  lastOccupant?: LastOccupant,
  now: Date = new Date()
): WalletCapacity {
  const quarantinedAt = now.toISOString();
  const existing = wallet.quarantinedNonces ?? [];
  const already = existing.find((q) => q.nonce === nonce);
  const entry: QuarantinedNonce = already
    ? { ...already, reason, lastOccupant: lastOccupant ?? already.lastOccupant }
    : { nonce, reason, quarantinedAt, lastOccupant };

  const quarantinedNonces = already
    ? existing.map((q) => (q.nonce === nonce ? entry : q))
    : [...existing, entry];

  const occupiedNonces = wallet.occupiedNonces.filter((o) => o.nonce !== nonce);

  const base = wallet.possibleNextNonce ?? wallet.assignmentHead;
  const quarantineSet = new Set(quarantinedNonces.map((q) => q.nonce));
  let next = Math.max(base, nonce + 1);
  while (quarantineSet.has(next)) next += 1;

  return {
    ...wallet,
    occupiedNonces,
    quarantinedNonces,
    possibleNextNonce: next,
  };
}

// ---------------------------------------------------------------------------
// reconcile
//
// Folds one address-filtered mempool read into wallet + ledger:
//   - adopts sponsor-owned tx_ids missing from the ledger
//   - flags ledger entries that are no longer visible in the mempool
//
// Returns the updated wallet + ledger plus the adopted/dropped nonce lists so
// the caller can log/alert. Pure — `now` is injectable.
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  wallet: WalletCapacity;
  ledger: SponsorLedger;
  adopted: number[];
  dropped: number[];
  // Orphans we saw but couldn't price (no fee_rate on the Hiro view).
  // Callers should quarantine/alert rather than assume a safe RBF baseline.
  unpriceableOrphans: number[];
}

export function reconcile(
  wallet: WalletCapacity,
  ledger: SponsorLedger,
  mempoolReadByNonce: Record<number, HiroSponsorTxView | null | undefined>,
  ourSponsorAddress: string,
  options: { now?: Date } = {}
): ReconcileResult {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  let nextWallet = wallet;
  let nextLedger = ledger;
  const adopted: number[] = [];
  const dropped: number[] = [];
  const unpriceableOrphans: number[] = [];

  for (const [nonceStr, hiroTx] of Object.entries(mempoolReadByNonce)) {
    const nonce = Number(nonceStr);
    if (!Number.isInteger(nonce) || nonce < 0) continue;
    if (!hiroTx) continue;

    const classification = classifyOccupant(
      hiroTx,
      ourSponsorAddress,
      nextLedger,
      nonce
    );
    if (classification.kind !== "sponsor_owned_orphan") continue;

    if (hiroTx.fee_rate === undefined) {
      unpriceableOrphans.push(nonce);
      continue;
    }

    nextWallet = adoptOrphan(nextWallet, hiroTx, { now });
    nextLedger = {
      ...nextLedger,
      entries: {
        ...nextLedger.entries,
        [String(nonce)]: {
          nonce,
          txId: hiroTx.tx_id,
          fee: hiroTx.fee_rate,
          broadcastAt: nowIso,
          rbfAttempts: 0,
        },
      },
    };
    adopted.push(nonce);
  }

  for (const [nonceStr, entry] of Object.entries(ledger.entries)) {
    const nonce = Number(nonceStr);
    if (!(nonce in mempoolReadByNonce)) continue;
    const observed = mempoolReadByNonce[nonce];
    if (!observed || observed.tx_id !== entry.txId) {
      dropped.push(entry.nonce);
    }
  }

  return {
    wallet: nextWallet,
    ledger: nextLedger,
    adopted,
    dropped,
    unpriceableOrphans,
  };
}

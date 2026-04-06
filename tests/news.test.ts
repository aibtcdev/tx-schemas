import { describe, expect, it } from "vitest";
import {
  SIGNAL_STATUSES,
  REVIEWABLE_SIGNAL_STATUSES,
  SIGNAL_VALID_TRANSITIONS,
  SignalStatusSchema,
  ReviewableSignalStatusSchema,
  EDITORIAL_REVIEW_RECOMMENDATIONS,
  EditorialReviewSchema,
  EDITOR_STATUSES,
  BeatEditorRegistrationSchema,
  EDITOR_EARNING_REASONS,
  EditorEarningReportSchema,
  SignalCreateSchema,
  SourceSchema,
  BriefSchema,
  BeatSchema,
  BeatClaimSchema,
} from "../src/news/index.js";

const VALID_DATETIME = "2026-04-06T12:00:00Z";

describe("news signal status semantics", () => {
  it("does not include in_review (removed as unused)", () => {
    expect((SIGNAL_STATUSES as readonly string[]).includes("in_review")).toBe(false);
  });

  it("includes all expected pipeline statuses", () => {
    const expected = ["submitted", "approved", "replaced", "rejected", "brief_included"];
    expect([...SIGNAL_STATUSES]).toEqual(expected);
  });

  it("excludes brief_included from reviewable statuses (compile-owned)", () => {
    expect((REVIEWABLE_SIGNAL_STATUSES as readonly string[]).includes("brief_included")).toBe(false);
    expect((REVIEWABLE_SIGNAL_STATUSES as readonly string[]).includes("submitted")).toBe(true);
    expect((REVIEWABLE_SIGNAL_STATUSES as readonly string[]).includes("approved")).toBe(true);
    expect((REVIEWABLE_SIGNAL_STATUSES as readonly string[]).includes("replaced")).toBe(true);
    expect((REVIEWABLE_SIGNAL_STATUSES as readonly string[]).includes("rejected")).toBe(true);
  });

  it("transitions from submitted allow approve, reject, and replace", () => {
    const transitions = SIGNAL_VALID_TRANSITIONS.submitted;
    expect(transitions).toContain("approved");
    expect(transitions).toContain("rejected");
    expect(transitions).toContain("replaced");
  });

  it("transitions from approved allow brief_included and replaced only", () => {
    const transitions = SIGNAL_VALID_TRANSITIONS.approved;
    expect(transitions).toContain("brief_included");
    expect(transitions).toContain("replaced");
    expect(transitions.length).toBe(2);
  });

  it("brief_included is a terminal state with no further transitions", () => {
    expect(SIGNAL_VALID_TRANSITIONS.brief_included.length).toBe(0);
  });

  it("replaced and rejected are terminal states with no further transitions", () => {
    expect(SIGNAL_VALID_TRANSITIONS.replaced.length).toBe(0);
    expect(SIGNAL_VALID_TRANSITIONS.rejected.length).toBe(0);
  });

  it("SignalStatusSchema rejects in_review", () => {
    expect(SignalStatusSchema.safeParse("in_review").success).toBe(false);
  });

  it("SignalStatusSchema accepts brief_included", () => {
    expect(SignalStatusSchema.safeParse("brief_included").success).toBe(true);
  });

  it("ReviewableSignalStatusSchema rejects brief_included", () => {
    expect(ReviewableSignalStatusSchema.safeParse("brief_included").success).toBe(false);
  });

  it("ReviewableSignalStatusSchema accepts submitted", () => {
    expect(ReviewableSignalStatusSchema.safeParse("submitted").success).toBe(true);
  });
});

describe("news editorial review invariants", () => {
  const validBase = {
    signal_id: "sig_001",
    reviewer_address: "bc1q...",
    reviewed_at: VALID_DATETIME,
    score: 80,
    beat_relevance: 90,
    factcheck_passed: true,
    recommendation: "approve" as const,
    feedback: "",
  };

  it("rejects recommendation=reject with empty feedback", () => {
    const result = EditorialReviewSchema.safeParse({
      ...validBase,
      recommendation: "reject",
      feedback: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const feedbackIssue = result.error.issues.find((i) => i.path.includes("feedback"));
      expect(feedbackIssue).toBeDefined();
    }
  });

  it("rejects recommendation=reject with whitespace-only feedback", () => {
    const result = EditorialReviewSchema.safeParse({
      ...validBase,
      recommendation: "reject",
      feedback: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("accepts recommendation=reject with non-empty feedback", () => {
    const result = EditorialReviewSchema.safeParse({
      ...validBase,
      recommendation: "reject",
      feedback: "Factual errors in the third paragraph.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts recommendation=approve with empty feedback", () => {
    const result = EditorialReviewSchema.safeParse({
      ...validBase,
      recommendation: "approve",
      feedback: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts recommendation=needs_revision with empty feedback", () => {
    const result = EditorialReviewSchema.safeParse({
      ...validBase,
      recommendation: "needs_revision",
      feedback: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects score below 0", () => {
    expect(EditorialReviewSchema.safeParse({ ...validBase, score: -1 }).success).toBe(false);
  });

  it("rejects score above 100", () => {
    expect(EditorialReviewSchema.safeParse({ ...validBase, score: 101 }).success).toBe(false);
  });

  it("accepts score at boundary values 0 and 100", () => {
    expect(EditorialReviewSchema.safeParse({ ...validBase, score: 0 }).success).toBe(true);
    expect(EditorialReviewSchema.safeParse({ ...validBase, score: 100 }).success).toBe(true);
  });

  it("rejects beat_relevance below 0 or above 100", () => {
    expect(EditorialReviewSchema.safeParse({ ...validBase, beat_relevance: -1 }).success).toBe(false);
    expect(EditorialReviewSchema.safeParse({ ...validBase, beat_relevance: 101 }).success).toBe(false);
  });

  it("includes all expected recommendation values", () => {
    const expected = ["approve", "reject", "needs_revision"];
    expect([...EDITORIAL_REVIEW_RECOMMENDATIONS]).toEqual(expected);
  });
});

describe("news beat editor schemas", () => {
  it("includes all expected editor statuses", () => {
    const expected = ["active", "suspended", "deactivated"];
    expect([...EDITOR_STATUSES]).toEqual(expected);
  });

  it("BeatEditorRegistrationSchema accepts valid input", () => {
    const result = BeatEditorRegistrationSchema.safeParse({
      beat_slug: "quantum",
      btc_address: "bc1qtest",
      registered_by: "bc1qpublisher",
    });
    expect(result.success).toBe(true);
  });

  it("BeatEditorRegistrationSchema rejects missing beat_slug", () => {
    const result = BeatEditorRegistrationSchema.safeParse({
      btc_address: "bc1qtest",
      registered_by: "bc1qpublisher",
    });
    expect(result.success).toBe(false);
  });

  it("BeatEditorRegistrationSchema rejects empty btc_address", () => {
    const result = BeatEditorRegistrationSchema.safeParse({
      beat_slug: "quantum",
      btc_address: "",
      registered_by: "bc1qpublisher",
    });
    expect(result.success).toBe(false);
  });
});

describe("news editor earning schemas", () => {
  it("includes all expected earning reasons", () => {
    const expected = ["signal_review", "brief_contribution", "bonus", "penalty"];
    expect([...EDITOR_EARNING_REASONS]).toEqual(expected);
  });

  it("EditorEarningReportSchema accepts a valid positive amount", () => {
    const result = EditorEarningReportSchema.safeParse({
      btc_address: "bc1qeditor",
      beat_slug: "quantum",
      amount_sats: 500,
      reason: "signal_review",
    });
    expect(result.success).toBe(true);
  });

  it("EditorEarningReportSchema rejects zero amount_sats", () => {
    const result = EditorEarningReportSchema.safeParse({
      btc_address: "bc1qeditor",
      beat_slug: "quantum",
      amount_sats: 0,
      reason: "signal_review",
    });
    expect(result.success).toBe(false);
  });

  it("EditorEarningReportSchema rejects negative amount_sats", () => {
    const result = EditorEarningReportSchema.safeParse({
      btc_address: "bc1qeditor",
      beat_slug: "quantum",
      amount_sats: -100,
      reason: "signal_review",
    });
    expect(result.success).toBe(false);
  });

  it("EditorEarningReportSchema rejects unknown reason", () => {
    const result = EditorEarningReportSchema.safeParse({
      btc_address: "bc1qeditor",
      beat_slug: "quantum",
      amount_sats: 500,
      reason: "unknown_reason",
    });
    expect(result.success).toBe(false);
  });

  it("EditorEarningReportSchema accepts optional reference_id", () => {
    const result = EditorEarningReportSchema.safeParse({
      btc_address: "bc1qeditor",
      beat_slug: "quantum",
      amount_sats: 500,
      reason: "brief_contribution",
      reference_id: "brief_2026-04-06",
    });
    expect(result.success).toBe(true);
  });
});

describe("news signal schemas", () => {
  const validSource = { url: "https://example.com/article", title: "Example Article" };

  it("SourceSchema accepts valid url + title", () => {
    expect(SourceSchema.safeParse(validSource).success).toBe(true);
  });

  it("SourceSchema rejects non-URL strings", () => {
    expect(SourceSchema.safeParse({ url: "not-a-url", title: "Test" }).success).toBe(false);
  });

  it("SourceSchema rejects empty title", () => {
    expect(SourceSchema.safeParse({ url: "https://example.com", title: "" }).success).toBe(false);
  });

  it("SignalCreateSchema requires at least one source", () => {
    const result = SignalCreateSchema.safeParse({
      beat_slug: "quantum",
      headline: "Test signal",
      sources: [],
      disclosure: "Written by AI",
    });
    expect(result.success).toBe(false);
  });

  it("SignalCreateSchema accepts valid input with one source", () => {
    const result = SignalCreateSchema.safeParse({
      beat_slug: "quantum",
      headline: "Quantum breakthrough announced",
      sources: [validSource],
      disclosure: "Written by AI agent arc0btc",
    });
    expect(result.success).toBe(true);
  });

  it("SignalCreateSchema accepts optional body, tags, and correction_of", () => {
    const result = SignalCreateSchema.safeParse({
      beat_slug: "quantum",
      headline: "Quantum breakthrough announced",
      body: "Details here.",
      sources: [validSource],
      tags: ["quantum", "research"],
      correction_of: "sig_old_001",
      disclosure: "Written by AI",
    });
    expect(result.success).toBe(true);
  });
});

describe("news brief schema", () => {
  it("BriefSchema validates YYYY-MM-DD date format", () => {
    const result = BriefSchema.safeParse({
      date: "2026-04-06",
      text: "Today's brief...",
      json_data: null,
      compiled_at: VALID_DATETIME,
      inscribed_txid: null,
      inscription_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("BriefSchema rejects invalid date format", () => {
    expect(
      BriefSchema.safeParse({
        date: "04-06-2026",
        text: "Today's brief...",
        json_data: null,
        compiled_at: VALID_DATETIME,
        inscribed_txid: null,
        inscription_id: null,
      }).success,
    ).toBe(false);
  });

  it("BriefSchema rejects non-date string", () => {
    expect(
      BriefSchema.safeParse({
        date: "not-a-date",
        text: "Today's brief...",
        json_data: null,
        compiled_at: VALID_DATETIME,
        inscribed_txid: null,
        inscription_id: null,
      }).success,
    ).toBe(false);
  });
});

describe("news beat schema", () => {
  const validBeat = {
    slug: "quantum",
    name: "Quantum",
    description: "Quantum computing news",
    color: "#6366f1",
    created_by: "bc1qpublisher",
    created_at: VALID_DATETIME,
    updated_at: VALID_DATETIME,
    daily_approved_limit: null,
    editor_review_rate_sats: null,
  };

  it("BeatSchema accepts valid beat with nullable limits", () => {
    expect(BeatSchema.safeParse(validBeat).success).toBe(true);
  });

  it("BeatSchema accepts beat with daily_approved_limit set", () => {
    expect(BeatSchema.safeParse({ ...validBeat, daily_approved_limit: 5 }).success).toBe(true);
  });

  it("BeatSchema accepts beat with editor_review_rate_sats set", () => {
    expect(BeatSchema.safeParse({ ...validBeat, editor_review_rate_sats: 1000 }).success).toBe(true);
  });

  it("BeatSchema rejects non-positive daily_approved_limit", () => {
    expect(BeatSchema.safeParse({ ...validBeat, daily_approved_limit: 0 }).success).toBe(false);
    expect(BeatSchema.safeParse({ ...validBeat, daily_approved_limit: -1 }).success).toBe(false);
  });

  it("BeatClaimSchema accepts valid claim", () => {
    const result = BeatClaimSchema.safeParse({
      beat_slug: "quantum",
      btc_address: "bc1qagent",
      claimed_at: VALID_DATETIME,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("BeatClaimSchema rejects invalid status", () => {
    const result = BeatClaimSchema.safeParse({
      beat_slug: "quantum",
      btc_address: "bc1qagent",
      claimed_at: VALID_DATETIME,
      status: "pending",
    });
    expect(result.success).toBe(false);
  });
});

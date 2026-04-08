import { describe, expect, it } from "vitest";
import {
  SIGNAL_STATUSES,
  REVIEWABLE_SIGNAL_STATUSES,
  REVIEW_OUTCOME_STATUSES,
  SIGNAL_VALID_TRANSITIONS,
  SignalStatusSchema,
  ReviewableSignalStatusSchema,
  ReviewOutcomeStatusSchema,
  SignalReviewRequestSchema,
  EDITORIAL_REVIEW_RECOMMENDATIONS,
  EditorialReviewSchema,
  EDITOR_STATUSES,
  BeatEditorSchema,
  BeatEditorRegistrationSchema,
  EditorEarningSchema,
  SignalSchema,
  SignalCreateSchema,
  SourceSchema,
  BriefSchema,
  BeatSchema,
  BeatWithLifecycleSchema,
  BeatClaimSchema,
  BeatMemberSchema,
  BEAT_LIFECYCLE_STATES,
  BeatLifecycleStateSchema,
  BeatTransitionMetadataSchema,
  BeatLifecycleFlagsSchema,
  BeatLifecycleMetadataSchema,
  BEAT_TRANSITION_RESPONSE_CODES,
  BeatTransitionResponseCodeSchema,
  BeatSelfHealingGuidanceSchema,
  BeatGracePeriodSuccessSchema,
  BeatGracePeriodSuccessEnvelopeSchema,
  BeatRetiredActionErrorSchema,
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

  it("transitions from submitted allow approve and reject only", () => {
    expect([...SIGNAL_VALID_TRANSITIONS.submitted]).toEqual(["approved", "rejected"]);
  });

  it("transitions from approved allow replaced, rejected, and brief_included", () => {
    expect([...SIGNAL_VALID_TRANSITIONS.approved]).toEqual(["replaced", "rejected", "brief_included"]);
  });

  it("transitions from replaced allow reconsidering (approved) or rejecting", () => {
    expect([...SIGNAL_VALID_TRANSITIONS.replaced]).toEqual(["approved", "rejected"]);
  });

  it("transitions from rejected allow reconsidering (approved)", () => {
    expect([...SIGNAL_VALID_TRANSITIONS.rejected]).toEqual(["approved"]);
  });

  it("transitions from brief_included allow publisher retract (replaced or rejected)", () => {
    expect([...SIGNAL_VALID_TRANSITIONS.brief_included]).toEqual(["replaced", "rejected"]);
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

  it("ReviewOutcomeStatusSchema excludes submitted", () => {
    expect(ReviewOutcomeStatusSchema.safeParse("submitted").success).toBe(false);
  });

  it("ReviewOutcomeStatusSchema accepts approved, rejected, replaced", () => {
    expect(ReviewOutcomeStatusSchema.safeParse("approved").success).toBe(true);
    expect(ReviewOutcomeStatusSchema.safeParse("rejected").success).toBe(true);
    expect(ReviewOutcomeStatusSchema.safeParse("replaced").success).toBe(true);
  });

  it("REVIEW_OUTCOME_STATUSES contains only valid review outcomes", () => {
    expect([...REVIEW_OUTCOME_STATUSES]).toEqual(["approved", "rejected", "replaced"]);
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
    const expected = ["active", "inactive"];
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

describe("news editor earning schemas (system-created at compile)", () => {
  // Editor earnings are no longer self-reported. They are created by the
  // compile job for each brief-included signal on a beat with an active editor.
  // EditorEarningReportSchema was removed — no self-report endpoint exists.
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

  it("BriefSchema rejects empty text", () => {
    expect(
      BriefSchema.safeParse({
        date: "2026-04-06",
        text: "",
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
  const validLifecycleMetadata = {
    lifecycle: "grace" as const,
    is_fileable: true,
    is_listed_active: false,
    is_assignable_editor: false,
    archive_only: false,
    replacement_beats: ["aibtc-network", "bitcoin-macro", "quantum"],
    transition_started_at: VALID_DATETIME,
    transition_effective_at: VALID_DATETIME,
    transition_message: "This beat is retiring soon.",
    transition_docs_url: "https://example.com/docs/aibtc-news-cutover",
  };

  it("BeatSchema accepts valid beat with nullable limits", () => {
    expect(BeatSchema.safeParse(validBeat).success).toBe(true);
  });

  it("BeatSchema remains backward compatible when lifecycle metadata is omitted", () => {
    expect(BeatSchema.safeParse(validBeat).success).toBe(true);
  });

  it("BeatSchema accepts beat with lifecycle metadata when present", () => {
    expect(BeatSchema.safeParse({ ...validBeat, ...validLifecycleMetadata }).success).toBe(true);
  });

  it("BeatWithLifecycleSchema requires explicit lifecycle metadata", () => {
    expect(BeatWithLifecycleSchema.safeParse(validBeat).success).toBe(false);
    expect(BeatWithLifecycleSchema.safeParse({ ...validBeat, ...validLifecycleMetadata }).success).toBe(
      true,
    );
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

  it("Beat lifecycle states include active, grace, retired", () => {
    expect([...BEAT_LIFECYCLE_STATES]).toEqual(["active", "grace", "retired"]);
    expect(BeatLifecycleStateSchema.safeParse("retired").success).toBe(true);
    expect(BeatLifecycleStateSchema.safeParse("inactive").success).toBe(false);
  });

  it("BeatTransitionMetadataSchema accepts nullable transition timestamps and docs url", () => {
    expect(
      BeatTransitionMetadataSchema.safeParse({
        replacement_beats: [],
        transition_started_at: null,
        transition_effective_at: null,
        transition_message: null,
        transition_docs_url: null,
      }).success,
    ).toBe(true);
  });

  it("BeatLifecycleFlagsSchema requires machine-readable lifecycle booleans", () => {
    expect(
      BeatLifecycleFlagsSchema.safeParse({
        lifecycle: "active",
        is_fileable: true,
        is_listed_active: true,
        is_assignable_editor: true,
        archive_only: false,
      }).success,
    ).toBe(true);

    expect(
      BeatLifecycleFlagsSchema.safeParse({
        lifecycle: "active",
        is_fileable: true,
        is_listed_active: true,
        is_assignable_editor: true,
      }).success,
    ).toBe(false);
  });

  it("BeatLifecycleMetadataSchema combines lifecycle flags and transition metadata", () => {
    expect(BeatLifecycleMetadataSchema.safeParse(validLifecycleMetadata).success).toBe(true);
  });

  it("Beat transition response codes are stable", () => {
    expect([...BEAT_TRANSITION_RESPONSE_CODES]).toEqual(["beat_transition_grace", "beat_retired"]);
    expect(BeatTransitionResponseCodeSchema.safeParse("beat_transition_grace").success).toBe(true);
    expect(BeatTransitionResponseCodeSchema.safeParse("unknown").success).toBe(false);
  });

  it("BeatSelfHealingGuidanceSchema accepts reusable response guidance", () => {
    expect(
      BeatSelfHealingGuidanceSchema.safeParse({
        replacement_beats: ["bitcoin-macro"],
        transition_started_at: VALID_DATETIME,
        transition_effective_at: VALID_DATETIME,
        docs_url: "https://example.com/docs/aibtc-news-cutover",
        message_for_agent: "Choose an active beat and retry.",
      }).success,
    ).toBe(true);
  });

  it("BeatGracePeriodSuccessSchema accepts grace-period success metadata", () => {
    expect(
      BeatGracePeriodSuccessSchema.safeParse({
        code: "beat_transition_grace",
        beat_lifecycle: "grace",
        replacement_beats: ["bitcoin-macro"],
        transition_started_at: VALID_DATETIME,
        transition_effective_at: VALID_DATETIME,
        docs_url: "https://example.com/docs/aibtc-news-cutover",
        message_for_agent: "This beat is retiring soon. Refile future work under an active beat.",
      }).success,
    ).toBe(true);
  });

  it("BeatGracePeriodSuccessEnvelopeSchema accepts the nested transition block contract", () => {
    expect(
      BeatGracePeriodSuccessEnvelopeSchema.safeParse({
        transition: {
          code: "beat_transition_grace",
          beat_lifecycle: "grace",
          replacement_beats: ["bitcoin-macro"],
          transition_started_at: VALID_DATETIME,
          transition_effective_at: VALID_DATETIME,
          docs_url: "https://example.com/docs/aibtc-news-cutover",
          message_for_agent: "This beat is retiring soon. Refile future work under an active beat.",
        },
      }).success,
    ).toBe(true);
  });

  it("BeatRetiredActionErrorSchema accepts machine-readable retired-beat errors", () => {
    expect(
      BeatRetiredActionErrorSchema.safeParse({
        error: 'Beat "legacy-slug" is retired and no longer accepts new filings',
        code: "beat_retired",
        beat_lifecycle: "retired",
        archive_only: true,
        replacement_beats: ["quantum"],
        transition_started_at: VALID_DATETIME,
        transition_effective_at: VALID_DATETIME,
        docs_url: "https://example.com/docs/aibtc-news-cutover",
        message_for_agent: "This beat is archive-only. Choose an active beat and retry.",
      }).success,
    ).toBe(true);
  });

  it("BeatRetiredActionErrorSchema rejects archive_only=false", () => {
    expect(
      BeatRetiredActionErrorSchema.safeParse({
        error: 'Beat "legacy-slug" is retired and no longer accepts new filings',
        code: "beat_retired",
        beat_lifecycle: "retired",
        archive_only: false,
        replacement_beats: ["quantum"],
        transition_started_at: VALID_DATETIME,
        transition_effective_at: VALID_DATETIME,
        docs_url: "https://example.com/docs/aibtc-news-cutover",
        message_for_agent: "This beat is archive-only. Choose an active beat and retry.",
      }).success,
    ).toBe(false);
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

  it("BeatMemberSchema accepts valid member (no beat_slug)", () => {
    const result = BeatMemberSchema.safeParse({
      btc_address: "bc1qagent",
      claimed_at: VALID_DATETIME,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("BeatMemberSchema rejects empty btc_address", () => {
    const result = BeatMemberSchema.safeParse({
      btc_address: "",
      claimed_at: VALID_DATETIME,
      status: "active",
    });
    expect(result.success).toBe(false);
  });
});

describe("news signal review request schema", () => {
  it("accepts approved without replaces_signal_id", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "approved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects submitted as a review outcome", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "submitted",
    });
    expect(result.success).toBe(false);
  });

  it("requires replaces_signal_id when new_status is replaced", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "replaced",
    });
    expect(result.success).toBe(false);
  });

  it("accepts replaced with replaces_signal_id", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "replaced",
      replaces_signal_id: "sig_000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects replaces_signal_id when new_status is not replaced", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "approved",
      replaces_signal_id: "sig_000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts rejected with optional publisher_feedback", () => {
    const result = SignalReviewRequestSchema.safeParse({
      signal_id: "sig_001",
      new_status: "rejected",
      publisher_feedback: "Does not meet editorial standards.",
    });
    expect(result.success).toBe(true);
  });
});

describe("news signal schema (full record)", () => {
  const validSignal = {
    id: "sig_001",
    beat_slug: "quantum",
    beat_name: null,
    btc_address: "bc1qcorrespondent",
    headline: "Quantum breakthrough",
    body: null,
    sources: [{ url: "https://example.com/article", title: "Example" }],
    tags: [],
    created_at: VALID_DATETIME,
    updated_at: VALID_DATETIME,
    correction_of: null,
    status: "submitted",
    publisher_feedback: null,
    reviewed_at: null,
    disclosure: "Written by AI",
  };

  it("accepts a valid full signal record", () => {
    expect(SignalSchema.safeParse(validSignal).success).toBe(true);
  });

  it("rejects empty sources array", () => {
    expect(SignalSchema.safeParse({ ...validSignal, sources: [] }).success).toBe(false);
  });

  it("rejects unknown status", () => {
    expect(SignalSchema.safeParse({ ...validSignal, status: "draft" }).success).toBe(false);
  });

  it("accepts all valid statuses", () => {
    for (const status of SIGNAL_STATUSES) {
      expect(SignalSchema.safeParse({ ...validSignal, status }).success).toBe(true);
    }
  });
});

describe("news beat editor schema (full record)", () => {
  const validEditor = {
    beat_slug: "quantum",
    btc_address: "bc1qeditor",
    status: "active" as const,
    registered_at: VALID_DATETIME,
    registered_by: "bc1qpublisher",
    deactivated_at: null,
  };

  it("accepts a valid active editor", () => {
    expect(BeatEditorSchema.safeParse(validEditor).success).toBe(true);
  });

  it("accepts all valid editor statuses", () => {
    for (const status of EDITOR_STATUSES) {
      expect(BeatEditorSchema.safeParse({ ...validEditor, status }).success).toBe(true);
    }
  });

  it("rejects unknown editor status", () => {
    expect(BeatEditorSchema.safeParse({ ...validEditor, status: "pending" }).success).toBe(false);
  });

  it("accepts optional deactivated_at datetime when status is inactive", () => {
    expect(
      BeatEditorSchema.safeParse({ ...validEditor, status: "inactive", deactivated_at: VALID_DATETIME }).success,
    ).toBe(true);
  });
});

describe("news editor earning schema (full record)", () => {
  // Editor earnings are system-created at compile time in the shared earnings table.
  // The beat context is encoded in the reason field as "editor_inclusion:{beat_slug}".
  const validEarning = {
    id: "earn_001",
    btc_address: "bc1qeditor",
    amount_sats: 500,
    reason: "editor_inclusion:quantum",
    created_at: VALID_DATETIME,
  };

  it("accepts a valid earning record", () => {
    expect(EditorEarningSchema.safeParse(validEarning).success).toBe(true);
  });

  it("accepts negative amount_sats", () => {
    expect(EditorEarningSchema.safeParse({ ...validEarning, amount_sats: -100 }).success).toBe(true);
  });

  it("accepts optional payout_txid", () => {
    expect(
      EditorEarningSchema.safeParse({
        ...validEarning,
        payout_txid: "tx_abc",
      }).success,
    ).toBe(true);
  });

  it("accepts optional reference_id (signal_id)", () => {
    expect(
      EditorEarningSchema.safeParse({
        ...validEarning,
        reference_id: "sig_001",
      }).success,
    ).toBe(true);
  });

  it("rejects empty reason", () => {
    expect(EditorEarningSchema.safeParse({ ...validEarning, reason: "" }).success).toBe(false);
  });
});

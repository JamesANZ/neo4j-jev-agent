import { describe, expect, it } from "vitest";
import { askHotel } from "../src/ask.js";
import type { Evidence } from "../src/facts.js";
import type { RetrievalFocus } from "../src/focus.js";
import {
  jevState,
  judgmentFromChoice,
  type JevJudge,
  type JevRequest,
} from "../src/jev.js";
import { YES_NO_REFUSAL } from "../src/questions.js";

const evidence: Evidence = {
  name: "AnyCompany Cairo Nile View",
  note: "amenities and services are only the records whose name or description contains the question terms. An empty list means this hotel record has no match.",
  amenities: [],
  services: [],
};

function graphWith(found: Evidence | null) {
  const calls: RetrievalFocus[] = [];
  return {
    calls,
    async getEvidence(name: string, focus: RetrievalFocus) {
      calls.push(focus);
      return found && found.name === name ? found : null;
    },
  };
}

describe("judgmentFromChoice", () => {
  it("marks low confidence for review", () => {
    expect(judgmentFromChoice("yes", 0.91, "jev-latest")).toEqual({
      verdict: "yes",
      confidence: 0.91,
      needsReview: false,
      model: "jev-latest",
    });
    expect(judgmentFromChoice("no", 0.59, "jev-latest").needsReview).toBe(true);
    expect(
      judgmentFromChoice("not_in_record", 0.6, "jev-latest").needsReview,
    ).toBe(false);
  });

  it("rejects an unexpected choice", () => {
    expect(() => judgmentFromChoice("maybe", 0.9, "jev-latest")).toThrow(
      /unexpected choice/i,
    );
  });
});

describe("askHotel", () => {
  it("refuses an open question before calling Jev", async () => {
    const calls: JevRequest[] = [];
    const judge: JevJudge = {
      async judge(request) {
        calls.push(request);
        return judgmentFromChoice("yes", 0.9, "jev-test");
      },
    };

    const result = await askHotel(graphWith(evidence), judge, {
      hotelName: evidence.name,
      question: "Which amenities does this hotel have?",
    });

    expect(result).toEqual({ ok: false, status: 400, error: YES_NO_REFUSAL });
    expect(calls).toHaveLength(0);
  });

  it("sends only the retrieved evidence to Jev", async () => {
    const calls: JevRequest[] = [];
    const judge: JevJudge = {
      async judge(request) {
        calls.push(request);
        return judgmentFromChoice("no", 0.88, "jev-test");
      },
    };
    const graph = graphWith(evidence);

    const result = await askHotel(graph, judge, {
      hotelName: evidence.name,
      question: "Does this hotel have babysitting?",
    });

    expect(graph.calls[0]).toMatchObject({
      kind: "facility",
      terms: ["babysit"],
      includeRooms: false,
      includePolicies: false,
    });
    expect(calls).toEqual([
      { state: jevState("Does this hotel have babysitting?", evidence) },
    ]);
    expect(result).toMatchObject({
      ok: true,
      verdict: "no",
      confidence: 0.88,
      needsReview: false,
      evidence,
    });
  });

  it("reports a missing hotel", async () => {
    const judge: JevJudge = {
      async judge() {
        throw new Error("should not run");
      },
    };
    const result = await askHotel(graphWith(null), judge, {
      hotelName: "Missing Hotel",
      question: "Does this hotel allow 5 guests?",
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "That hotel is not in the graph.",
    });
  });
});

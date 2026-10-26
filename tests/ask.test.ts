import { describe, expect, it } from "vitest";
import { askHotel } from "../src/ask.js";
import type { FactSheet } from "../src/facts.js";
import {
  jevState,
  judgmentFromChoice,
  type JevJudge,
  type JevRequest,
} from "../src/jev.js";
import { YES_NO_REFUSAL } from "../src/questions.js";

const hotel: FactSheet = {
  name: "AnyCompany Cairo Nile View",
  address: "789 Corniche el-Nil, Cairo 11519, Egypt",
  guest_rating: 4.6,
  total_rooms: 120,
  email: null,
  phone: null,
  rooms: [
    {
      type: "Standard Room",
      bed_configuration: "One queen bed",
      max_occupancy: 2,
      min_rate: 90,
      max_rate: 140,
    },
  ],
  amenities: ["Outdoor swimming pool", "Spa"],
  policies: [{ name: "Cancellation", description: "Cancel 48 hours ahead." }],
  services: [],
};

function graphWith(sheet: FactSheet | null) {
  return {
    async getFactSheet(name: string) {
      return sheet && sheet.name === name ? sheet : null;
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

    const result = await askHotel(graphWith(hotel), judge, {
      hotelName: hotel.name,
      question: "Which amenities does this hotel have?",
    });

    expect(result).toEqual({ ok: false, status: 400, error: YES_NO_REFUSAL });
    expect(calls).toHaveLength(0);
  });

  it("sends the fact sheet to Jev and returns the verdict", async () => {
    const calls: JevRequest[] = [];
    const judge: JevJudge = {
      async judge(request) {
        calls.push(request);
        return judgmentFromChoice("no", 0.88, "jev-test");
      },
    };

    const result = await askHotel(graphWith(hotel), judge, {
      hotelName: hotel.name,
      question: "Does this hotel have babysitting?",
    });

    expect(calls).toEqual([
      { state: jevState("Does this hotel have babysitting?", hotel) },
    ]);
    expect(result).toMatchObject({
      ok: true,
      verdict: "no",
      confidence: 0.88,
      needsReview: false,
      factSheet: hotel,
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

import { describe, expect, it } from "vitest";
import { retrievalFocus } from "../src/focus.js";

describe("retrievalFocus", () => {
  it("retrieves room occupancy for a guest-count question", () => {
    const focus = retrievalFocus("Does this hotel allow 5 guests?");
    expect(focus.kind).toBe("occupancy");
    expect(focus.guestCount).toBe(5);
    expect(focus.includeRooms).toBe(true);
    expect(focus.includeAmenities).toBe(false);
    expect(focus.includePolicies).toBe(false);
    expect(focus.includeServices).toBe(false);
    expect(focus.terms).toEqual([]);
  });

  it("searches facilities for an amenity question", () => {
    const focus = retrievalFocus("Does this hotel have babysitting?");
    expect(focus.kind).toBe("facility");
    expect(focus.terms).toEqual(["babysit"]);
    expect(focus.includeAmenities).toBe(true);
    expect(focus.includeServices).toBe(true);
    expect(focus.includeRooms).toBe(false);
    expect(focus.includePolicies).toBe(false);
  });

  it("maps gym to the fitness records and pool to pool records", () => {
    expect(retrievalFocus("Does this hotel have a gym?").terms).toEqual(["fitness"]);
    expect(retrievalFocus("Does this hotel have a pool?").terms).toContain("pool");
  });

  it("retrieves policies without the rest of the hotel", () => {
    const focus = retrievalFocus("Does this hotel have a cancellation policy?");
    expect(focus.kind).toBe("policy");
    expect(focus.terms).toEqual(["cancel"]);
    expect(focus.includePolicies).toBe(true);
    expect(focus.includeAmenities).toBe(false);
    expect(focus.includeRooms).toBe(false);
  });
});

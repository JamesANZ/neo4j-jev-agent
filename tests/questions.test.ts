import { describe, expect, it } from "vitest";
import { questionRefusal, YES_NO_REFUSAL } from "../src/questions.js";

describe("questionRefusal", () => {
  it("accepts amenity and guest-count questions", () => {
    expect(questionRefusal("Does this hotel have babysitting?")).toBeNull();
    expect(questionRefusal("Does this hotel allow 5 guests?")).toBeNull();
    expect(questionRefusal("Can I book a room for four guests?")).toBeNull();
    expect(questionRefusal("Is the pool included?")).toBeNull();
  });

  it("refuses open questions and blank input", () => {
    expect(questionRefusal("")).toBe(YES_NO_REFUSAL);
    expect(questionRefusal("Which Chicago hotel has a spa?")).toBeNull();
    expect(questionRefusal("Which of the following hotels has a pool?")).toBeNull();
    expect(questionRefusal("Do all hotels have a pool?")).toBeNull();
    expect(questionRefusal("Which amenities does this hotel have?")).toBe(
      YES_NO_REFUSAL,
    );
    expect(questionRefusal("What is the cancellation policy?")).toBe(
      YES_NO_REFUSAL,
    );
    expect(questionRefusal("How many guests are allowed?")).toBe(
      YES_NO_REFUSAL,
    );
    expect(questionRefusal("Why is the rating high?")).toBe(YES_NO_REFUSAL);
    expect(questionRefusal("List the amenities")).toBe(YES_NO_REFUSAL);
    expect(questionRefusal("Babysitting")).toBe(YES_NO_REFUSAL);
  });
});

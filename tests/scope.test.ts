import { describe, expect, it } from "vitest";
import { namedHotels, termsOutsideHotelNames } from "../src/scope.js";

describe("namedHotels", () => {
  const hotels = [
    { name: "Acorn City Suites", address: "Raleigh" },
    { name: "Acorn", address: "Raleigh" },
    { name: "Adobe Plaza Inn", address: "Albuquerque" },
  ];

  it("keeps the longest hotel name that appears in the question", () => {
    expect(
      namedHotels(
        "Which of the following hotels has a pool: Acorn City Suites or Adobe Plaza Inn?",
        hotels,
      ),
    ).toEqual(["Acorn City Suites", "Adobe Plaza Inn"]);
  });

  it("searches the whole catalog when the question names no hotel", () => {
    expect(namedHotels("Which hotels have a pool?", hotels)).toEqual([]);
  });

  it("drops hotel-name words and keeps the amenity term", () => {
    expect(
      termsOutsideHotelNames(
        ["pool", "acorn", "city", "suites", "suite", "adobe", "plaza", "inn"],
        ["Acorn City Suites", "Adobe Plaza Inn"],
      ),
    ).toEqual(["pool"]);
  });
});

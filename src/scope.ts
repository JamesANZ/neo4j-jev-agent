import type { HotelSummary } from "./facts.js";

export const ALL_HOTELS = "__all__";

export function namedHotels(question: string, hotels: HotelSummary[]): string[] {
  const haystack = question.toLowerCase();
  const found = hotels
    .map((hotel) => hotel.name)
    .filter((name) => name.length > 3 && haystack.includes(name.toLowerCase()))
    .sort((left, right) => right.length - left.length);
  return found.filter(
    (name, index) =>
      !found
        .slice(0, index)
        .some((longer) => longer.toLowerCase().includes(name.toLowerCase())),
  );
}

export function termsOutsideHotelNames(terms: string[], names: string[]): string[] {
  if (names.length === 0) return terms;
  const nameTokens = new Set<string>();
  for (const name of names) {
    for (const token of name.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token) continue;
      nameTokens.add(token);
      if (token.length > 4 && token.endsWith("s")) nameTokens.add(token.slice(0, -1));
    }
  }
  return terms.filter((term) => !nameTokens.has(term));
}

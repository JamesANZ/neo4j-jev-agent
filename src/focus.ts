export type RetrievalFocus = {
  kind:
    | "live_availability"
    | "occupancy"
    | "facility"
    | "policy"
    | "identity"
    | "mixed";
  guestCount: number | null;
  terms: string[];
  includeRooms: boolean;
  includeOccupancy: boolean;
  includeRates: boolean;
  includeBeds: boolean;
  includeAmenities: boolean;
  includeServices: boolean;
  includePolicies: boolean;
  includeAddress: boolean;
  includePhone: boolean;
  includeEmail: boolean;
  includeRating: boolean;
  includeTotalRooms: boolean;
};

const STOP_WORDS = new Set([
  "does",
  "do",
  "did",
  "is",
  "are",
  "was",
  "were",
  "can",
  "could",
  "will",
  "would",
  "has",
  "have",
  "may",
  "might",
  "should",
  "shall",
  "this",
  "that",
  "the",
  "a",
  "an",
  "hotel",
  "hotels",
  "which",
  "following",
  "these",
  "those",
  "all",
  "every",
  "each",
  "allow",
  "allows",
  "allowed",
  "with",
  "for",
  "of",
  "and",
  "or",
  "be",
  "it",
  "its",
  "on",
  "in",
  "at",
  "to",
  "my",
  "our",
  "your",
  "there",
  "any",
  "please",
  "yes",
  "no",
  "not",
  "i",
  "we",
  "me",
  "you",
  "guest",
  "guests",
  "people",
  "person",
  "persons",
  "adult",
  "adults",
  "policy",
  "policies",
  "amenity",
  "amenities",
  "service",
  "services",
  "facility",
  "facilities",
  "offer",
  "offers",
  "offered",
  "include",
  "includes",
  "included",
  "provide",
  "provides",
  "provided",
]);

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const SYNONYMS: Record<string, string[]> = {
  gym: ["fitness"],
  fitness: ["fitness"],
  wifi: ["wifi"],
  internet: ["wifi"],
  wireless: ["wifi"],
  pool: ["pool"],
  swimming: ["swimming", "pool"],
  spa: ["spa"],
  babysitting: ["babysit"],
  babysitter: ["babysit"],
  babysit: ["babysit"],
  childcare: ["child"],
  kids: ["kid"],
  children: ["child"],
  child: ["child"],
  pets: ["pet"],
  pet: ["pet"],
  dogs: ["pet", "dog"],
  dog: ["pet", "dog"],
  cats: ["pet", "cat"],
  cat: ["pet", "cat"],
  parking: ["parking"],
  shuttle: ["shuttle"],
  airport: ["airport"],
  cancellation: ["cancel"],
  cancel: ["cancel"],
  smoking: ["smok"],
  smoke: ["smok"],
  restaurant: ["restaurant"],
  dining: ["restaurant"],
  breakfast: ["breakfast"],
};

const GUEST_TERMS = new Set(["adult", "child", "guest", "kid", "people", "person"]);

const POLICY_TERMS = new Set([
  "age",
  "cancel",
  "damage",
  "deposit",
  "payment",
  "pet",
  "policy",
  "quiet",
  "refund",
  "smok",
]);

function guestCount(question: string): number | null {
  const digit = question.match(
    /\b(\d+)\s*(guests?|people|persons?|adults?|children|kids)\b/i,
  );
  if (digit?.[1]) return Number(digit[1]);
  const word = question.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(guests?|people|persons?|adults?|children|kids)\b/i,
  );
  if (!word?.[1]) return null;
  return NUMBER_WORDS[word[1].toLowerCase()] ?? null;
}

function termsFor(question: string): string[] {
  const normalized = question
    .toLowerCase()
    .replace(/wi-fi/g, "wifi")
    .replace(/child\s+care/g, "childcare");
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
  const terms = new Set<string>();
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || NUMBER_WORDS[token] || /^\d+$/.test(token)) {
      continue;
    }
    const synonyms = SYNONYMS[token];
    if (synonyms) {
      for (const synonym of synonyms) terms.add(synonym);
      continue;
    }
    if (token.length >= 3) terms.add(token);
    if (token.length > 4 && token.endsWith("s")) terms.add(token.slice(0, -1));
  }
  return [...terms];
}

function kindFor(focus: Omit<RetrievalFocus, "kind">): RetrievalFocus["kind"] {
  if (
    !focus.includeRooms &&
    !focus.includeAmenities &&
    !focus.includeServices &&
    !focus.includePolicies &&
    !focus.includeAddress &&
    !focus.includePhone &&
    !focus.includeEmail &&
    !focus.includeRating &&
    !focus.includeTotalRooms
  ) {
    return "live_availability";
  }
  const slices = [
    focus.includeRooms,
    focus.includeAmenities || focus.includeServices,
    focus.includePolicies,
    focus.includeAddress ||
      focus.includePhone ||
      focus.includeEmail ||
      focus.includeRating ||
      focus.includeTotalRooms,
  ].filter(Boolean).length;
  if (slices > 1) return "mixed";
  if (focus.includeRooms) return "occupancy";
  if (focus.includePolicies) return "policy";
  if (focus.includeAmenities || focus.includeServices) return "facility";
  return "identity";
}

export function retrievalFocus(question: string): RetrievalFocus {
  const text = question.toLowerCase();
  const liveRoom =
    /\b(vacancy|vacancies|inventory)\b/.test(text) ||
    (/\brooms?\b/.test(text) && /\b(available|availability)\b/.test(text));
  if (liveRoom) {
    return kinded({
      guestCount: null,
      terms: [],
      includeRooms: false,
      includeOccupancy: false,
      includeRates: false,
      includeBeds: false,
      includeAmenities: false,
      includeServices: false,
      includePolicies: false,
      includeAddress: false,
      includePhone: false,
      includeEmail: false,
      includeRating: false,
      includeTotalRooms: false,
    });
  }

  const count = guestCount(question);
  const extracted = termsFor(question);
  const terms = count == null ? extracted : extracted.filter((term) => !GUEST_TERMS.has(term));
  const rates = /\b(price|prices|rate|rates|cost|costs|expensive|cheap)\b/.test(text);
  const beds = /\b(bed|beds)\b/.test(text);
  const rooms = count != null || rates || beds || /\b(suite|suites)\b/.test(text);
  const policies =
    /\b(policy|policies)\b/.test(text) ||
    terms.some((term) => POLICY_TERMS.has(term));
  const searchFacilities = terms.some(
    (term) => !POLICY_TERMS.has(term) || term === "pet" || term === "dog" || term === "cat",
  );

  return kinded({
    guestCount: count,
    terms,
    includeRooms: rooms,
    includeOccupancy: count != null || rooms,
    includeRates: rates,
    includeBeds: beds,
    includeAmenities: searchFacilities,
    includeServices: searchFacilities,
    includePolicies: policies,
    includeAddress: /\baddress\b/.test(text),
    includePhone: /\bphone\b/.test(text),
    includeEmail: /\bemail\b/.test(text),
    includeRating: /\brating\b/.test(text),
    includeTotalRooms: /\b(\d+)\s+rooms?\b/.test(text) && count == null,
  });
}

function kinded(focus: Omit<RetrievalFocus, "kind">): RetrievalFocus {
  return { ...focus, kind: kindFor(focus) };
}

export function evidenceNote(focus: RetrievalFocus): string {
  switch (focus.kind) {
    case "live_availability":
      return "Live room availability is not stored in this graph.";
    case "occupancy":
      return "rooms lists every room category, with only the fields this question needs. Yes when a room's max_occupancy is at least guest_count.";
    case "facility":
      return "amenities and services are only the records whose name or description contains the question terms. An empty list means this hotel record has no match.";
    case "policy":
      return "policies are only the records whose name or description contains the question terms. An empty list means this hotel record has no match.";
    case "identity":
      return "Only the hotel fields named by the question were retrieved.";
    case "mixed":
      return "Only categories relevant to the question were retrieved, and only records matching its terms. An empty list means nothing matched in that category.";
  }
}

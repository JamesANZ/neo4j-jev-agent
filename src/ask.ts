import type { CatalogEvidence, Evidence, HotelSummary } from "./facts.js";
import { retrievalFocus } from "./focus.js";
import type { GraphStore } from "./graph.js";
import {
  catalogState,
  jevState,
  MissingApiKeyError,
  type JevJudge,
  type Judgment,
} from "./jev.js";
import { isCatalogQuestion, questionRefusal } from "./questions.js";
import { ALL_HOTELS, namedHotels, termsOutsideHotelNames } from "./scope.js";

export type AskInput = {
  hotelName: unknown;
  question: unknown;
};

export type AskSuccess = {
  ok: true;
  hotelName: string;
  question: string;
  verdict: Judgment["verdict"];
  confidence: number;
  needsReview: boolean;
  model: string;
  answer: string;
  evidence?: Evidence;
  catalog?: CatalogEvidence;
};

export type AskFailure = {
  ok: false;
  status: number;
  error: string;
};

export type AskResult = AskSuccess | AskFailure;

export async function listHotels(
  graph: Pick<GraphStore, "listHotels">,
): Promise<HotelSummary[]> {
  return graph.listHotels();
}

function answerLabel(kind: "hotel" | "which" | "all", verdict: Judgment["verdict"]): string {
  if (verdict === "not_in_record") return "Not in the record";
  if (kind === "which") return verdict === "yes" ? "These hotels" : "None";
  return verdict === "yes" ? "Yes" : "No";
}

export async function askHotel(
  graph: Pick<GraphStore, "getEvidence" | "listHotels" | "searchHotels">,
  judge: JevJudge,
  input: AskInput,
): Promise<AskResult> {
  const hotelName =
    typeof input.hotelName === "string" ? input.hotelName.trim() : "";
  const question =
    typeof input.question === "string" ? input.question.trim() : "";
  const across = hotelName === ALL_HOTELS || isCatalogQuestion(question);

  if (!across && !hotelName) {
    return { ok: false, status: 400, error: "Select a hotel first." };
  }

  const refusal = questionRefusal(question);
  if (refusal) {
    return { ok: false, status: 400, error: refusal };
  }

  if (across) {
    return askAcrossHotels(graph, judge, question);
  }

  const focus = retrievalFocus(question);
  let evidence: Evidence | null;
  try {
    evidence = await graph.getEvidence(hotelName, focus);
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Neo4j query failed.",
    };
  }

  if (!evidence) {
    return { ok: false, status: 404, error: "That hotel is not in the graph." };
  }

  try {
    const judgment = await judge.judge({
      state: jevState(question, evidence),
    });
    return {
      ok: true,
      hotelName: evidence.name,
      question,
      verdict: judgment.verdict,
      confidence: judgment.confidence,
      needsReview: judgment.needsReview,
      model: judgment.model,
      answer: answerLabel("hotel", judgment.verdict),
      evidence,
    };
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return { ok: false, status: 503, error: error.message };
    }
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Jev request failed.",
    };
  }
}

async function askAcrossHotels(
  graph: Pick<GraphStore, "listHotels" | "searchHotels">,
  judge: JevJudge,
  question: string,
): Promise<AskResult> {
  const focus = retrievalFocus(question);
  const kind = /\b(all|every|each)\b/i.test(question) ? "all" : "which";
  let names: string[] = [];
  try {
    if (isCatalogQuestion(question)) {
      names = namedHotels(question, await graph.listHotels());
    }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Neo4j query failed.",
    };
  }

  const terms = termsOutsideHotelNames(focus.terms, names);
  if (terms.length === 0 && focus.guestCount == null) {
    return {
      ok: false,
      status: 400,
      error: "Say what to look for, such as a pool or a guest count.",
    };
  }

  let catalog: CatalogEvidence;
  try {
    catalog = await graph.searchHotels({ ...focus, terms }, names);
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Neo4j query failed.",
    };
  }

  try {
    const judgment = await judge.judgeCatalog({
      state: catalogState(question, kind, catalog),
    });
    return {
      ok: true,
      hotelName: names.length > 0 ? "Named hotels" : "All hotels",
      question,
      verdict: judgment.verdict,
      confidence: judgment.confidence,
      needsReview: judgment.needsReview,
      model: judgment.model,
      answer: answerLabel(kind, judgment.verdict),
      catalog,
    };
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      return { ok: false, status: 503, error: error.message };
    }
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Jev request failed.",
    };
  }
}

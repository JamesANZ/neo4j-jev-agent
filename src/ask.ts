import type { FactSheet, HotelSummary } from "./facts.js";
import type { GraphStore } from "./graph.js";
import {
  jevState,
  MissingApiKeyError,
  type JevJudge,
  type Judgment,
} from "./jev.js";
import { questionRefusal } from "./questions.js";

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
  factSheet: FactSheet;
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

export async function askHotel(
  graph: Pick<GraphStore, "getFactSheet">,
  judge: JevJudge,
  input: AskInput,
): Promise<AskResult> {
  const hotelName =
    typeof input.hotelName === "string" ? input.hotelName.trim() : "";
  const question =
    typeof input.question === "string" ? input.question.trim() : "";

  if (!hotelName) {
    return { ok: false, status: 400, error: "Select a hotel first." };
  }

  const refusal = questionRefusal(question);
  if (refusal) {
    return { ok: false, status: 400, error: refusal };
  }

  let factSheet: FactSheet | null;
  try {
    factSheet = await graph.getFactSheet(hotelName);
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : "Neo4j query failed.",
    };
  }

  if (!factSheet) {
    return { ok: false, status: 404, error: "That hotel is not in the graph." };
  }

  try {
    const judgment = await judge.judge({
      state: jevState(question, factSheet),
    });
    return {
      ok: true,
      hotelName: factSheet.name,
      question,
      verdict: judgment.verdict,
      confidence: judgment.confidence,
      needsReview: judgment.needsReview,
      model: judgment.model,
      factSheet,
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

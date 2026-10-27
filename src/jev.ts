import { choice, TypeSafeClient, TypeSafeError } from "@typesafe-ai/sdk";
import type { AppConfig } from "./config.js";
import { CATALOG_NOTE, type CatalogEvidence, type Evidence } from "./facts.js";

export const REVIEW_CONFIDENCE = 0.6;

export const VERDICTS = ["yes", "no", "not_in_record"] as const;
export type VerdictChoice = (typeof VERDICTS)[number];

export type Judgment = {
  verdict: VerdictChoice;
  confidence: number;
  needsReview: boolean;
  model: string;
};

export type JevState = {
  guest_question: string;
  hotel: Evidence;
};

export type JevRequest = {
  state: JevState;
};

export type CatalogJevState = {
  guest_question: string;
  question_kind: "which" | "all";
  note: string;
  scope_count: number;
  match_count: number;
  hotels: CatalogEvidence["hotels"];
};

export type CatalogJevRequest = {
  state: CatalogJevState;
};

export interface JevJudge {
  judge(request: JevRequest): Promise<Judgment>;
  judgeCatalog(request: CatalogJevRequest): Promise<Judgment>;
}

const INSTRUCTIONS =
  "Using only the hotel record in the state, does it support a yes answer to the guest's question?";

const CRITERIA = {
  yes: "A retrieved record states the requested fact. For guest_count, at least one room has max_occupancy greater than or equal to that number.",
  no: "The retrieved records contradict the question, or a searched list is empty. An empty amenity, service, or policy list means the hotel record has no match.",
  not_in_record:
    "The question needs a fact that was not retrieved, including live room availability.",
} as const;

const CATALOG_INSTRUCTIONS =
  "Using only the retrieved hotel snippets, what is the decision for the guest's question?";

const CATALOG_CRITERIA = {
  yes: "question_kind is which and at least one hotel snippet shows the requested amenity, service, policy, or room. Or question_kind is all, match_count equals scope_count, and match_count is greater than zero.",
  no: "question_kind is which and hotels is empty. Or question_kind is all and match_count is not equal to scope_count.",
  not_in_record:
    "The snippets are a different kind of fact from the question, including live room availability.",
} as const;

export function jevState(question: string, hotel: Evidence): JevState {
  return {
    guest_question: question.trim(),
    hotel,
  };
}

export function catalogState(
  question: string,
  kind: "which" | "all",
  evidence: CatalogEvidence,
): CatalogJevState {
  return {
    guest_question: question.trim(),
    question_kind: kind,
    note: CATALOG_NOTE,
    scope_count: evidence.scopeCount,
    match_count: evidence.matchCount,
    hotels: evidence.hotels,
  };
}

export function judgmentFromChoice(
  choiceValue: string,
  confidence: number,
  model: string,
): Judgment {
  if (!VERDICTS.includes(choiceValue as VerdictChoice)) {
    throw new Error(`Jev returned an unexpected choice: ${choiceValue}`);
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Jev returned a confidence outside 0 to 1.");
  }
  return {
    verdict: choiceValue as VerdictChoice,
    confidence,
    needsReview: confidence < REVIEW_CONFIDENCE,
    model,
  };
}

export class TypeSafeJevJudge implements JevJudge {
  private readonly client: TypeSafeClient;

  constructor(private readonly config: AppConfig) {
    this.client = new TypeSafeClient({
      apiKey: config.typesafeApiKey,
      defaultModel: config.jevModel,
    });
  }

  async judge(request: JevRequest): Promise<Judgment> {
    if (!this.config.typesafeApiKey) {
      throw new MissingApiKeyError();
    }
    try {
      const response = await this.client.systemOne({
        model: this.config.jevModel,
        state: request.state,
        questions: {
          answer: choice(INSTRUCTIONS, CRITERIA),
        },
      });
      const answer = response.answers.answer;
      return judgmentFromChoice(
        answer.choice,
        answer.confidence,
        response.model,
      );
    } catch (error) {
      throw this.failure(error);
    }
  }

  async judgeCatalog(request: CatalogJevRequest): Promise<Judgment> {
    if (!this.config.typesafeApiKey) {
      throw new MissingApiKeyError();
    }
    try {
      const response = await this.client.systemOne({
        model: this.config.jevModel,
        state: request.state,
        questions: {
          answer: choice(CATALOG_INSTRUCTIONS, CATALOG_CRITERIA),
        },
      });
      const answer = response.answers.answer;
      return judgmentFromChoice(
        answer.choice,
        answer.confidence,
        response.model,
      );
    } catch (error) {
      throw this.failure(error);
    }
  }

  private failure(error: unknown): Error {
    if (error instanceof MissingApiKeyError) return error;
    const message =
      error instanceof TypeSafeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Jev request failed";
    return new Error(message);
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "TYPESAFE_API_KEY is not set. Add it to your .env file and restart the server.",
    );
    this.name = "MissingApiKeyError";
  }
}

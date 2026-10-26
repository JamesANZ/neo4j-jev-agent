import { choice, TypeSafeClient, TypeSafeError } from "@typesafe-ai/sdk";
import type { AppConfig } from "./config.js";
import { RECORD_NOTE, type FactSheet } from "./facts.js";

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
  record_note: string;
  hotel: FactSheet;
};

export type JevRequest = {
  state: JevState;
};

export interface JevJudge {
  judge(request: JevRequest): Promise<Judgment>;
}

const INSTRUCTIONS =
  "Using only the hotel record in the state, does it support a yes answer to the guest's question?";

const CRITERIA = {
  yes: "The record states the fact the guest asked about. For a guest count, at least one room has max_occupancy greater than or equal to that number.",
  no: "The record covers this topic and the fact is absent or contradicts the question. Amenity and service lists are complete, so a missing facility or service is a no. For a guest count, no is correct when every room's max_occupancy is below the number asked.",
  not_in_record:
    "The record does not contain the kind of fact needed to answer, including live room availability, current prices beyond the stored rate range, or a rule that was never stored.",
} as const;

export function jevState(question: string, hotel: FactSheet): JevState {
  return {
    guest_question: question.trim(),
    record_note: RECORD_NOTE,
    hotel,
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
      if (error instanceof MissingApiKeyError) throw error;
      const message =
        error instanceof TypeSafeError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Jev request failed";
      throw new Error(message);
    }
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

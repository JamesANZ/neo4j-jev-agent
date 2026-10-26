export const YES_NO_REFUSAL =
  "Ask a yes/no question, such as whether the hotel has an amenity or allows a number of guests.";

const OPEN_QUESTION =
  /\b(which|what|whats|what's|who|whom|whose|why|where|when|how)\b|\b(list|describe|explain|compare)\b|\b(tell|show)\s+me\b/i;

const YES_NO_START =
  /^(do|does|did|is|are|was|were|can|could|will|would|has|have|may|might|should|shall)\b/i;

export function questionRefusal(question: string): string | null {
  const text = question.trim();
  if (!text) return YES_NO_REFUSAL;
  const body = text.replace(/[?!.]+$/u, "").trim();
  if (!body || OPEN_QUESTION.test(body) || !YES_NO_START.test(body)) {
    return YES_NO_REFUSAL;
  }
  return null;
}

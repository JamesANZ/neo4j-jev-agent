export const YES_NO_REFUSAL =
  "Ask a yes/no question about one hotel, or which hotels match, such as whether a hotel has a pool.";

const HARD_REFUSAL =
  /\b(what|whats|what's|who|whom|whose|why|where|when|how)\b|\b(list|describe|explain|compare)\b|\b(tell|show)\s+me\b/i;

const YES_NO_START =
  /^(do|does|did|is|are|was|were|can|could|will|would|has|have|may|might|should|shall)\b/i;

export function isCatalogQuestion(question: string): boolean {
  const text = question.toLowerCase();
  if (/\bwhich of the following\b/.test(text)) return true;
  if (/\bwhich\s+(?:\w+\s+){0,2}hotels?\b/.test(text)) return true;
  if (/\b(all|every|each)\b(?:\s+\w+){0,3}\s+hotels?\b/.test(text)) return true;
  return false;
}

export function questionRefusal(question: string): string | null {
  const text = question.trim();
  if (!text) return YES_NO_REFUSAL;
  const body = text.replace(/[?!.]+$/u, "").trim();
  if (!body || HARD_REFUSAL.test(body)) return YES_NO_REFUSAL;
  if (isCatalogQuestion(body)) return null;
  if (!YES_NO_START.test(body)) return YES_NO_REFUSAL;
  return null;
}

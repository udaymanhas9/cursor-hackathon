import { Cohort } from "../domain/types.js";

// Deterministic FNV-1a hash → fraction in [0,1). The same sessionId always maps
// to the same cohort, so experiments are reproducible (no RNG, no Date).
export function hashFraction(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function assignCohort(sessionId: string, holdoutRate: number): Cohort {
  return hashFraction(sessionId) < holdoutRate ? "holdout" : "treatment";
}

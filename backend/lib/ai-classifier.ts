import { z } from "zod";
import { affirmedMatches, hasElectricalWaterExposure, independentEvidence, issueClauses, normalizeIssueText, type KeywordMatch } from "./classifier-matching.ts";

/**
 * AI Decision Capability & Issue Categorizer — Mae Fah Luang University (MFU) Edition
 * Grounded with real-world MFU campus facilities, tropical weather patterns, and student dorm issues.
 * 
 * Disciplines & Grounding:
 * - Plumbing: Bidet sprayers, shower water heaters (Chiang Rai cool season), clogged drains, turbid tap water.
 * - Electrical: Dorm room breaker trips (kettle/hair dryer overload), lightning surge cuts, loose outlets.
 * - HVAC: AC indoor water leakage, AC blowing warm air, moldy vent smell, noisy/wobbly ceiling fans.
 * - Safety & Grounds: Wasp/hornet nests outside dorm windows, snake sightings, door latch/keycard lock failure, torn window screens.
 */

export const MFU_BUILDINGS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "S1 Science Laboratory Wing", keywords: ["s1", "s-1", "science laboratory wing"] },
  { id: "11111111-1111-1111-1111-111111111111", name: "C1 / C2 Lecture Complex", keywords: ["c1", "c2", "c-1", "c-2", "lecture complex"] },
  { id: "44444444-4444-4444-8444-444444444444", name: "E1 School of Information Tech", keywords: ["e1", "e-1", "school of information tech", "school of information technology"] },
  { id: "33333333-3333-4333-8333-333333333333", name: "AD1 Administration Building", keywords: ["ad1", "ad-1", "administration building"] },
] as const;

export const KNOWN_CATEGORIES = {
  Plumbing: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Plumbing",
    sla_hours: 12,
    keywords: [
      // Standard Plumbing
      "leak", "pipe", "water", "sink", "toilet", "drain", "faucet", "flooding", "drip",
      "flush", "clog", "clogged", "bathroom", "restroom", "basin", "sewer", "plumbing",
      // MFU Specific Plumbing
      "bidet", "bidet sprayer", "spray hose", "hose leak", "water heater", "shower heater",
      "no hot water", "no water", "water not flowing", "water heater not working", "hair in drain", "shower drain", "slow drain",
      "red water", "muddy water", "turbid water", "dirty tap water", "water pressure low",
      "low water pressure", "toilet overflowing", "tank leaking", "faucet dripping",
      // Multilingual (Thai)
      "ท่อ", "ท่อแตก", "น้ำรั่ว", "ก๊อกน้ำ", "ส้วมตัน", "น้ำไม่ไหล"
    ],
  },
  Electrical: {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Electrical",
    sla_hours: 8,
    keywords: [
      // Standard Electrical
      "outlet", "socket", "spark", "breaker", "power", "light", "bulb", "flickering",
      "switch", "switchboard", "wire", "wiring", "voltage", "blackout", "circuit", "electricity", "plug", "short", "fuse",
      // MFU Specific Electrical
      "breaker tripped", "breaker trip", "smart meter", "electric meter trip", "power cut", "no power",
      "thunderstorm blackout", "lightning power surge", "surge", "fluorescent ballast", "buzzing light",
      "kettle tripped", "hair dryer tripped power", "loose wall socket", "burnt socket",
      "black scorch mark", "wall plug loose", "lan port loose", "power outage in dorm",
      // Multilingual (Thai)
      "ไฟดับ", "ไฟช็อต", "ปลั๊กไฟ", "เบรกเกอร์", "ไฟกะพริบ"
    ],
  },
  HVAC: {
    id: "66666666-6666-4666-8666-666666666666",
    name: "HVAC",
    sla_hours: 18,
    keywords: [
      // Standard HVAC
      "ac", "air condition", "air-conditioner", "air conditioning", "heating", "cooling",
      "temperature", "ventilation", "fan", "cold", "hot", "vent", "chiller", "airflow", "hvac", "thermostat",
      // MFU Specific HVAC
      "ac leaking water", "ac water dripping", "water dripping from ac", "ac dripping on bed",
      "ac blowing warm air", "ac not cold", "ac not cooling", "air conditioner not cooling", "no airflow", "ac warm", "dirty air filter", "ice on ac coil",
      "musty smell", "mold smell in ac", "mildew smell", "ceiling fan noisy", "fan squeaking",
      "ceiling fan wobbling", "fan stuck speed", "ac remote control broken", "remote dead", "humid",
      // Multilingual (Thai)
      "แอร์", "แอร์ไม่เย็น", "ร้อน", "ร้อนมาก", "พัดลม", "แอร์มีกลิ่น"
    ],
  },
  Safety: {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Safety",
    sla_hours: 24,
    keywords: [
      // Standard Safety
      "fire", "alarm", "smoke", "hazard", "chemical", "exit", "door lock", "latch",
      "emergency", "extinguisher", "gas", "safety", "toxic", "stuck locked", "shattered glass",
      // MFU Campus Grounds & Environmental Safety
      "wasp nest", "hornet nest", "wasps", "hornets", "bees nest outside window", "snake",
      "snake sighting", "centipede", "stray dog", "mosquito net torn", "window screen torn",
      "keycard reader broken", "door lock jammed", "cannot lock dorm room", "magnetic lock stuck",
      "slippery walkway", "slippery moss", "slippery pathway in rain", "fire exit jammed",
      "hanging wires", "live electrical", "switchboard hazard",
      // Multilingual (Thai)
      "อันตราย", "งู", "ทางหนีไฟ", "ไฟไหม้", "ควัน", "แก๊สรั่ว", "ก๊าซรั่ว", "ประตูพัง"
    ],
  },
} as const;

export type CategoryName = keyof typeof KNOWN_CATEGORIES;

export const classifyInputSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(2000),
  title: z.string().trim().max(200).optional(),
});

export type ClassifyInput = z.infer<typeof classifyInputSchema>;

export type ClassificationResult = {
  fallbackToManual: boolean;
  category_id?: string;
  category_name?: CategoryName;
  sla_hours?: number;
  confidence?: number;
  decision_method: "Laya-Model" | "Deterministic-Fallback" | "Prompt-Defense";
  execution_time_ms: number;
  reason?: string;
  detected_building?: {
    id: string;
    name: string;
  };
};

const CONFIDENCE_REVIEW_THRESHOLD = 0.40;
const MAX_LATENCY_MS = 1500;
const AMBIGUITY_MARGIN = 0.15;
const WEAK_TERMS = new Set(["ac", "fan", "cold", "hot", "temperature", "heating", "cooling", "vent", "water", "pipe", "sink", "toilet", "drain", "faucet", "flush", "bathroom", "restroom", "basin", "light", "bulb", "outlet", "socket", "power", "switch", "plug", "alarm", "exit", "chemical", "plumbing", "electricity", "safety", "hvac", "ท่อ", "แอร์", "พัดลม", "ร้อน"]);
const FAULT_TERMS = ["broken", "damaged", "faulty", "flickering", "leak", "drip", "clog", "overflow", "overflowing", "not working", "not cooling", "not cold", "isn't working", "isn't cooling", "doesn't work", "doesn't cool", "no power", "no water", "won't turn off", "won't turn on", "cannot lock", "เสีย", "พัง", "รั่ว", "ตัน", "ไม่เย็น", "ไม่ไหล"];

// Prompt injection patterns to intercept (Lab 1 / Threat T-01 & Lab 2 Golden Dataset)
const INJECTION_PATTERNS = [
  /\[SYSTEM\s*(?:INSTRUCTION)?\s*OVERRIDE/i,
  /ignore\s+(?:all\s+)?prior\s+rules/i,
  /forget\s+all\s+(?:previous\s+)?instructions/i,
  /CRITICAL_SAFETY_BYPASS/i,
  /ROOT_ADMIN/i,
  /you\s+are\s+dan\b/i,
  /do\s+anything\s+now/i,
  /(?:print|output|leak|reveal).*(?:keys|database|secret|env|token)/i,
];

/**
 * Classifies an incoming issue description using MFU facility intelligence.
 */
export async function classifyIssueDescription(
  input: ClassifyInput,
  options: { signal?: AbortSignal; budgetMs?: number } = {},
): Promise<ClassificationResult> {
  const startTime = performance.now();
  const budgetMs = options.budgetMs ?? MAX_LATENCY_MS;
  const timedOut = () => options.signal?.aborted || performance.now() - startTime >= budgetMs;
  const timeoutResult = (): ClassificationResult => ({ fallbackToManual: true, decision_method: "Deterministic-Fallback", execution_time_ms: Math.round((performance.now() - startTime) * 100) / 100, reason: "NFR_TIMEOUT: Category suggestion exceeded its time budget" });
  const textToAnalyze = normalizeIssueText(`${input.title ?? ""}.\n${input.description}`);

  // 1. Threat T-01 Defense: Intercept prompt injection attacks
  for (const pattern of INJECTION_PATTERNS) {
    if (timedOut()) return timeoutResult();
    if (pattern.test(input.description) || (input.title && pattern.test(input.title))) {
      const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        fallbackToManual: true,
        decision_method: "Prompt-Defense",
        execution_time_ms: elapsed,
        reason: "PROMPT_INJECTION_DEFENSE: Untrusted instruction sequence intercepted",
      };
    }
  }

  // A unique explicit building is a hint only. Generic words never imply a room.
  const buildings = MFU_BUILDINGS.filter((building) => affirmedMatches(textToAnalyze, building.keywords, timedOut, "building").length > 0);
  const detectedBuilding = buildings.length === 1 ? { id: buildings[0].id, name: buildings[0].name } : undefined;
  const scores: Record<CategoryName, number> = { Plumbing: 0, Electrical: 0, HVAC: 0, Safety: 0 };
  const evidence: Record<CategoryName, KeywordMatch[]> = { Plumbing: [], Electrical: [], HVAC: [], Safety: [] };
  const faults = affirmedMatches(textToAnalyze, FAULT_TERMS, timedOut);

  for (const [name, category] of Object.entries(KNOWN_CATEGORIES) as [CategoryName, typeof KNOWN_CATEGORIES[CategoryName]][]) {
    if (timedOut()) return timeoutResult();
    evidence[name] = independentEvidence(affirmedMatches(textToAnalyze, category.keywords, timedOut));
    // Count independent evidence once: a phrase and its component words are not
    // separate votes, and repeating the same keyword does not boost confidence.
    scores[name] = evidence[name].reduce((sum, match) => sum + (/\s|-/.test(match.term) ? 3 : 1), 0);
  }

  const hazardous = affirmedMatches(textToAnalyze, ["fire", "smoke", "gas", "snake", "emergency", "hanging wires", "live electrical", "live wire", "ไฟไหม้", "ควัน", "แก๊สรั่ว", "ก๊าซรั่ว", "งู", "ทางหนีไฟ"], timedOut).length > 0;
  const safetyPriority = hazardous || hasElectricalWaterExposure(textToAnalyze, timedOut);
  if (safetyPriority) {
    // Explicit hazards take priority. Unrelated plumbing and electrical reports
    // alone must not manufacture a water/electrical safety conflict.
    scores.Safety = Object.values(scores).reduce((sum, score) => sum + score, 0) + 4;
  }
  if (timedOut()) return timeoutResult();

  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const ranked = (Object.entries(scores) as [CategoryName, number][]).sort((a, b) => b[1] - a[1]);
  const [bestCategory, maxScore] = ranked[0];
  // This legacy field is a keyword-score share, not a calibrated probability.
  const confidence = total ? Math.round(maxScore / total * 100) / 100 : undefined;
  const fallback = (reason: string): ClassificationResult => ({
    fallbackToManual: true, decision_method: "Deterministic-Fallback",
    execution_time_ms: Math.round((performance.now() - startTime) * 100) / 100,
    ...(confidence !== undefined ? { confidence } : {}), reason, detected_building: detectedBuilding,
  });
  if (!total) return fallback("AMBIGUOUS_OR_UNMATCHED: No affirmative facility evidence matched");
  if (maxScore === ranked[1][1] || (maxScore - ranked[1][1]) / total < AMBIGUITY_MARGIN) {
    return fallback("AMBIGUOUS_CATEGORIES: Multiple categories need manual review");
  }

  const strongEvidence = evidence[bestCategory].some((match) => !WEAK_TERMS.has(match.term));
  const clauses = issueClauses(textToAnalyze);
  const nearbyFault = evidence[bestCategory].some((match) => faults.some((fault) => {
    if (fault.clause !== match.clause) return false;
    // Avoid borrowing the fault in 'broken floor tile near the AC'.
    const gap = clauses[match.clause].slice(Math.min(match.end, fault.end), Math.max(match.start, fault.start));
    return gap.length <= 45 && !/\b(?:near|beside|around|with|next to|without)\b/u.test(gap);
  }));
  if (!(bestCategory === "Safety" && safetyPriority) && !strongEvidence && !nearbyFault) {
    return fallback("INSUFFICIENT_EVIDENCE: A facility name alone does not describe a fault");
  }
  if (confidence === undefined || confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    return fallback("LOW_CONFIDENCE: Please choose the category manually");
  }
  if (timedOut()) return timeoutResult();
  const category = KNOWN_CATEGORIES[bestCategory];
  return {
    fallbackToManual: false, category_id: category.id, category_name: bestCategory,
    sla_hours: category.sla_hours, confidence, decision_method: "Laya-Model",
    execution_time_ms: Math.round((performance.now() - startTime) * 100) / 100,
    detected_building: detectedBuilding,
  };
}

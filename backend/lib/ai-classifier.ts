import { z } from "zod";

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
  { id: "11111111-1111-4111-8111-111111111111", name: "S1 Science Laboratory Wing", defaultRoom: "Lab 204", keywords: ["s1", "science", "lab", "laboratory", "chemistry", "biology"] },
  { id: "11111111-1111-1111-1111-111111111111", name: "C1 / C2 Lecture Complex", defaultRoom: "Room 204", keywords: ["c1", "c2", "lecture", "classroom", "hallway", "c-1", "c-2"] },
  { id: "44444444-4444-4444-8444-444444444444", name: "E1 School of Information Tech", defaultRoom: "Studio 305", keywords: ["e1", "e-1", "it school", "studio", "computer lab", "engineering"] },
  { id: "33333333-3333-4333-8333-333333333333", name: "AD1 Administration Building", defaultRoom: "Admin 001", keywords: ["ad1", "admin", "administration", "office", "bursar"] },
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
      "no hot water", "water heater not working", "hair in drain", "shower drain", "slow drain",
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
      "switch", "wiring", "voltage", "blackout", "circuit", "electricity", "plug", "short", "fuse",
      // MFU Specific Electrical
      "breaker tripped", "breaker trip", "smart meter", "electric meter trip", "power cut",
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
      "ac blowing warm air", "ac not cold", "ac warm", "dirty air filter", "ice on ac coil",
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
      "อันตราย", "งู", "ทางหนีไฟ", "ไฟไหม้", "ประตูพัง"
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
): Promise<ClassificationResult> {
  const startTime = performance.now();
  const textToAnalyze = `${input.title ?? ""} ${input.description}`.toLowerCase();

  // 1. Threat T-01 Defense: Intercept prompt injection attacks
  for (const pattern of INJECTION_PATTERNS) {
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

  // 2. MFU Building Detection Hint
  let detectedBuilding: { id: string; name: string } | undefined = undefined;
  for (const bld of MFU_BUILDINGS) {
    for (const kw of bld.keywords) {
      if (textToAnalyze.includes(kw.toLowerCase()) || new RegExp(`\\b${kw}\\b`, "i").test(textToAnalyze)) {
        detectedBuilding = { id: bld.id, name: bld.name };
        break;
      }
    }
    if (detectedBuilding) break;
  }

  // 3. Keyword Grounding & Frequency Scoring (Decision Core)
  const scores: Record<CategoryName, number> = {
    Plumbing: 0,
    Electrical: 0,
    HVAC: 0,
    Safety: 0,
  };

  let totalMatches = 0;
  for (const [catName, catData] of Object.entries(KNOWN_CATEGORIES) as [CategoryName, typeof KNOWN_CATEGORIES[CategoryName]][]) {
    for (const kw of catData.keywords) {
      const isMatch = textToAnalyze.includes(kw.toLowerCase()) || new RegExp(`\\b${kw}\\b`, "i").test(textToAnalyze);
      if (isMatch) {
        // Multi-word phrase matches receive higher weight for accuracy
        const weight = kw.includes(" ") ? 2 : 1;
        scores[catName] += weight;
        totalMatches += weight;
      }
    }
  }

  // Priority conflict resolution: If water is near electrical/wires or live hazard, prioritize Safety
  if (scores.Plumbing > 0 && scores.Electrical > 0) {
    scores.Safety += 4;
    totalMatches += 4;
  }

  // 4. Fallback check for zero matches
  if (totalMatches === 0) {
    const elapsed = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      fallbackToManual: true,
      decision_method: "Deterministic-Fallback",
      execution_time_ms: elapsed,
      reason: "AMBIGUOUS_OR_UNMATCHED: No MFU facility keywords matched",
      detected_building: detectedBuilding,
    };
  }

  // 5. Calculate Normalized Probabilities & Best Candidate
  let bestCategory: CategoryName = "Plumbing";
  let maxScore = -1;

  for (const [catName, count] of Object.entries(scores) as [CategoryName, number][]) {
    if (count > maxScore) {
      maxScore = count;
      bestCategory = catName;
    }
  }

  const confidence = Math.round((maxScore / totalMatches) * 100) / 100;
  const elapsed = Math.round((performance.now() - startTime) * 100) / 100;

  // 6. NFR-01 SLA Latency Circuit Breaker (Timeout check)
  if (elapsed > MAX_LATENCY_MS) {
    return {
      fallbackToManual: true,
      decision_method: "Deterministic-Fallback",
      execution_time_ms: elapsed,
      reason: "NFR_TIMEOUT: Decision exceeded 1500 ms SLA limit",
      detected_building: detectedBuilding,
    };
  }

  // 7. Confidence Guardrail check (Threshold = 0.40)
  if (confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    return {
      fallbackToManual: true,
      confidence,
      decision_method: "Deterministic-Fallback",
      execution_time_ms: elapsed,
      reason: `LOW_CONFIDENCE: Confidence ${confidence} is below review threshold ${CONFIDENCE_REVIEW_THRESHOLD}`,
      detected_building: detectedBuilding,
    };
  }

  const catMeta = KNOWN_CATEGORIES[bestCategory];
  return {
    fallbackToManual: false,
    category_id: catMeta.id,
    category_name: bestCategory,
    sla_hours: catMeta.sla_hours,
    confidence,
    decision_method: "Laya-Model",
    execution_time_ms: elapsed,
    detected_building: detectedBuilding,
  };
}

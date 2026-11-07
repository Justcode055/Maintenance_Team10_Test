export type KeywordMatch = { term: string; start: number; end: number; clause: number };

export function normalizeIssueText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, "-");
}

const inflections: Record<string, string> = {
  leak: "leak(?:s|ed|ing)?", pipe: "pipes?", sink: "sinks?", toilet: "toilets?", drain: "drains?",
  faucet: "faucets?", drip: "drip(?:s|ped|ping)?", clog: "clog(?:s|ged|ging)?",
  outlet: "outlets?", socket: "sockets?", spark: "spark(?:s|ed|ing)?", breaker: "breakers?",
  light: "lights?", bulb: "bulbs?", switch: "switch(?:es)?", plug: "plugs?", wire: "wires?",
  fan: "fans?", vent: "vents?", alarm: "alarms?", hazard: "hazard(?:s|ous)?", snake: "snakes?",
};
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map<string, RegExp>();

function keywordPattern(term: string): RegExp {
  let pattern = patterns.get(term);
  if (!pattern) {
    const normalized = normalizeIssueText(term);
    const thai = /[\u0e00-\u0e7f]/.test(normalized);
    const body = normalized.split(/[\s-]+/).map((word) => inflections[word] ?? escapePattern(word)).join("[\\s-]+");
    // Thai does not use spaces between words. Latin terms need real boundaries:
    // AC must not match crack/replace, light must not match flashlight/lightning.
    pattern = new RegExp(thai ? body : `(?<![a-z0-9])${body}(?![a-z0-9])`, "gu");
    patterns.set(term, pattern);
  }
  return pattern;
}

function isNegated(clause: string, start: number, end: number, term: string): boolean {
  let before = clause.slice(0, start).slice(-100);
  // A new subject after a comma/conjunction starts its own assertion.
  before = before.replace(/^.*\b(?:and|or)\s+(?=(?:the\s+)?[a-z]+\s+(?:is|are|was|were|has|have)\b)/u, "");
  const after = clause.slice(end, end + 65);
  if (/\b(?:and|or)\s+(?:the\s+)?$/u.test(before)
    && /^\s+(?:(?:is|are|was|were)\s+)?(?:leaking|sparking|burning|broken|damaged|leak|smoke)\b/u.test(after)) before = "";
  // A functional failure followed by another assertion is not a denial of it:
  // "AC not cooling and smoke" / "no power and smoke" still report smoke.
  before = before.replace(/^.*\b(?:no (?:hot )?water|no power|no airflow|(?:not|isn't|aren't|doesn't) (?:working|cooling|cold|flowing|work|cool))\b[^.!?;\n]*\b(?:and|or)\s*/u, "");
  const words = before.replace(/,/g, " ").replace(/\bnot\s+(?:sure|certain|clear|only)\b/gu, "");
  const denied = /\b(?:no|without|never)\b(?:\s+[a-z'-]+){0,6}\s*$/u.test(words)
    || /\b(?:not|isn't|aren't|wasn't|weren't|don't|doesn't|didn't)\b(?:\s+(?!(?:and|or)\b)[a-z'-]+){0,6}\s*$/u.test(words)
    || /(?:ไม่มี|ไม่พบ|ไม่เห็น|ปราศจาก|ไม่ได้มี)[^.!?;\n]{0,35}$/u.test(before);
  if (denied) return true;
  // "Pipe is not leaking" denies a problem; "AC is not cooling" describes one.
  if (/^\s*(?:(?:is|are|was|were)\s+not|isn't|aren't|wasn't|weren't)\s+(?:leaking|broken|damaged|sparking|burning|blocked|clogged|faulty|present|detected|seen|found|visible)\b/u.test(after)
    || /^(?:ไม่(?:ได้)?(?:รั่ว|แตก|เสีย|พัง|ไหม้)|ปกติ)/u.test(after)) return true;
  // Intrinsic fault phrases are positive evidence, except "no power failure".
  return /^(?:no power|no water|no airflow)$/u.test(term)
    && /^\s+(?:failure|problem|issue|fault|loss|outage|leak|leaking|drip|dripping|damage)\b/u.test(after);
}

export function issueClauses(text: string): string[] {
  return text.split(/[.!?;\n]+|\b(?:but|however|yet)\b|แต่|และ(?=มี|เกิด|พบ)|,\s*(?=(?:the|there|it|this|that|my|our|at|in)\b|(?:[a-z]+\s+){1,3}(?:is|are|has|have|sparked|sparking|leaking|broken)\b)/u);
}

function buildingDenied(clause: string, start: number, end: number): boolean {
  const before = clause.slice(Math.max(0, start - 70), start);
  const after = clause.slice(end, end + 50);
  return /\b(?:not|isn't|aren't|wasn't|weren't|no longer)\s+(?:(?:at|in|near|inside|outside|building|the)\s+){0,3}(?:[a-z]+-?\d+\s+(?:or|and)\s+)?$/u.test(before)
    || /ไม่(?:ใช่|ได้อยู่|อยู่)(?:ที่|ใน|อาคาร)?\s*$/u.test(before)
    || /^\s+(?:is|was)\s+not\s+(?:the\s+)?(?:location|building|site)\b/u.test(after);
}

export function affirmedMatches(text: string, terms: readonly string[], timedOut: () => boolean = () => false, context: "issue" | "building" = "issue"): KeywordMatch[] {
  const clauses = issueClauses(text);
  const matches: KeywordMatch[] = [];
  for (const term of terms) {
    if (timedOut()) break;
    const pattern = keywordPattern(term);
    for (const [clauseIndex, clause] of clauses.entries()) {
      pattern.lastIndex = 0;
      for (const match of clause.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        const denied = context === "building" ? buildingDenied(clause, start, end) : isNegated(clause, start, end, term);
        if (!denied) matches.push({ term, start, end, clause: clauseIndex });
      }
    }
  }
  return matches;
}

export function independentEvidence(matches: KeywordMatch[]): KeywordMatch[] {
  const selected: KeywordMatch[] = [];
  for (const match of [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
    if (selected.some((item) => item.term === match.term || (item.clause === match.clause && item.start < match.end && match.start < item.end))) continue;
    selected.push(match);
  }
  return selected;
}

export function hasElectricalWaterExposure(text: string, timedOut: () => boolean): boolean {
  const water = affirmedMatches(text, ["water", "leak", "drip", "flooding", "น้ำ", "น้ำรั่ว"], timedOut);
  const electrical = affirmedMatches(text, ["live electrical", "switchboard", "outlet", "socket", "wire", "wiring", "ปลั๊กไฟ", "สายไฟ"], timedOut);
  const clauses = issueClauses(text);
  return water.some((liquid) => electrical.some((target) => {
    if (liquid.clause !== target.clause) return false;
    const gap = clauses[liquid.clause].slice(Math.min(liquid.end, target.end), Math.max(liquid.start, target.start));
    return gap.length <= 100 && /\b(?:on|onto|near|next to|over|under|into|touching|reaching|contact)\b|ใกล้|โดน|ลงบน|บน/u.test(gap);
  }));
}

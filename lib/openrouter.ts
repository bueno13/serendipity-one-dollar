import type { ExtractedProfile, Participant } from "./types";

export const MODEL = "meta/muse-ember";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export interface LlmResult<T> {
  data: T;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number | null;
  };
}

async function chatJson<T>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  reasoningEffort?: "minimal" | "low" | "medium";
}): Promise<LlmResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      // ASCII only: header values must be ByteStrings (em dash would throw).
      "X-Title": "Serendipity - The $1 Networking Brain",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_tokens: opts.maxTokens,
      temperature: 0.3,
      response_format: { type: "json_object" },
      usage: { include: true },
      // Muse Ember is a reasoning model: without an effort cap it burns
      // hundreds of tokens on hidden reasoning and truncates before JSON.
      // "minimal" (~200 completion tokens) suffices for extraction;
      // "low" (~600) keeps matching cheap and complete.
      ...(opts.reasoningEffort
        ? { reasoning: { effort: opts.reasoningEffort } }
        : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenRouter error ${res.status}: ${text.slice(0, 400) || res.statusText}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json().catch(() => null);
  if (!json) throw new Error("OpenRouter returned non-JSON response");

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(
      "OpenRouter returned empty content (likely reasoning truncation — check max_tokens / reasoning effort)"
    );
  }

  // Some models wrap JSON in code fences despite json_object mode.
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const data = JSON.parse(cleaned) as T;

  const usage = json.usage ?? {};
  // OpenRouter returns {prompt_tokens, completion_tokens, total_tokens, cost}.
  // (Older drafts used `total` — handle both; fall back to prompt+completion.)
  const prompt_tokens = Number(usage.prompt_tokens ?? 0) || 0;
  const completion_tokens = Number(usage.completion_tokens ?? 0) || 0;
  const total_tokens =
    Number(usage.total_tokens ?? usage.total ?? 0) || prompt_tokens + completion_tokens;
  const rawCost = usage.cost ?? json.cost ?? null;
  const cost_usd =
    typeof rawCost === "number" && Number.isFinite(rawCost) ? rawCost : null;

  return {
    data,
    usage: {
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cost_usd,
    },
  };
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

export async function extractProfile(
  p: Pick<Participant, "name" | "title" | "offers_text" | "needs_text">
): Promise<LlmResult<ExtractedProfile>> {
  const system = `You extract a concise networking profile as JSON.
Return ONLY JSON with exactly this shape:
{"role":string,"industry":string,"skills":string[],"offers":string[],"needs":string[],"interests":string[]}
Rules: concise normalized labels (1-4 words each), max 8 items per array, preserve important details, never invent facts.`;
  const user = `Name: ${p.name}
What they do: ${p.title}
Can help with: ${p.offers_text}
Looking for: ${p.needs_text}`;
  const res = await chatJson<Record<string, unknown>>({
    system,
    user,
    maxTokens: 800,
    reasoningEffort: "minimal",
  });
  const d = res.data;
  const profile: ExtractedProfile = {
    role: String(d.role ?? p.title).slice(0, 80),
    industry: String(d.industry ?? "technology").slice(0, 40),
    skills: toArray(d.skills),
    offers: toArray(d.offers),
    needs: toArray(d.needs),
    interests: toArray(d.interests),
  };
  return { data: profile, usage: res.usage };
}

export interface RawMatch {
  person_a_id: string;
  person_b_id: string;
  score: number;
  reason: string;
  value_for_a: string;
  value_for_b: string;
  conversation_starter: string;
}

export interface MatchCandidate {
  a: Participant;
  b: Participant;
}

function profileSummary(p: Participant): string {
  const prof = p.profile;
  if (!prof)
    return `${p.name} — ${p.title} | Offers: ${p.offers_text} | Needs: ${p.needs_text}`;
  return [
    `${p.name} (${p.id})`,
    `Role: ${prof.role} | Industry: ${prof.industry}`,
    `Skills: ${prof.skills.join(", ") || "—"}`,
    `Offers: ${prof.offers.join(", ") || p.offers_text}`,
    `Needs: ${prof.needs.join(", ") || p.needs_text}`,
  ].join("\n");
}

export async function evaluatePairs(
  pairs: MatchCandidate[]
): Promise<LlmResult<RawMatch[]>> {
  const system = `You evaluate networking introductions between people at a tech event.
Score each pair 0-100 using this rubric:
- Practical value (0-35): can one concretely help the other?
- Complementarity (0-25): do offers and needs fit?
- Mutual benefit (0-20): credible reason for BOTH to connect?
- Serendipity (0-20): valuable but not obvious?
Rules: be specific (reference actual offers/needs), never invent expertise, do NOT inflate scores, similar jobs alone are NOT a high score, one-sided matches score lower, concise explanations (1-2 sentences each).
Return ONLY JSON: {"matches":[{"person_a_id":string,"person_b_id":string,"score":number,"reason":string,"value_for_a":string,"value_for_b":string,"conversation_starter":string}]}.
Include EVERY pair you were given, even low scores.`;
  const listing = pairs
    .map(
      (pair, i) =>
        `PAIR ${i + 1}:\n${profileSummary(pair.a)}\n---\n${profileSummary(pair.b)}`
    )
    .join("\n\n");
  const res = await chatJson<{ matches: RawMatch[] }>({
    system,
    user: listing,
    // 12-pair batches with verbose profiles exceed 2500 tokens; 4000 is safe.
    maxTokens: 4000,
    reasoningEffort: "low",
  });
  const matches = Array.isArray(res.data?.matches) ? res.data.matches : [];
  // Clamp + sanitize.
  const safe = matches
    .filter((m) => m && m.person_a_id && m.person_b_id)
    .map((m) => ({
      person_a_id: String(m.person_a_id),
      person_b_id: String(m.person_b_id),
      score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))),
      reason: String(m.reason ?? "").slice(0, 500),
      value_for_a: String(m.value_for_a ?? "").slice(0, 500),
      value_for_b: String(m.value_for_b ?? "").slice(0, 500),
      conversation_starter: String(m.conversation_starter ?? "").slice(0, 300),
    }));
  return { data: safe, usage: res.usage };
}

/** Deterministic candidate filter: prefer complementary offers↔needs overlap.
 *  Scores by keyword overlap between A's offers and B's needs (and vice versa).
 *  No AI involved — purely to keep inference cheap and bounded. */
export function selectCandidates(participants: Participant[], limit: number): MatchCandidate[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s/+-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const tokensOf = (p: Participant) => {
    const prof = p.profile;
    const offers = new Set<string>();
    const needs = new Set<string>();
    const offerText = prof ? prof.offers.join(" ") : p.offers_text;
    const needText = prof ? prof.needs.join(" ") : p.needs_text;
    norm(offerText).forEach((w) => offers.add(w));
    norm(needText).forEach((w) => needs.add(w));
    return { offers, needs };
  };
  const toks = new Map(participants.map((p) => [p.id, tokensOf(p)]));
  const pairs: { a: Participant; b: Participant; s: number }[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      const ta = toks.get(a.id)!;
      const tb = toks.get(b.id)!;
      let s = 0;
      ta.offers.forEach((w) => {
        if (tb.needs.has(w)) s += 1;
      });
      tb.offers.forEach((w) => {
        if (ta.needs.has(w)) s += 1;
      });
      // Small bonus for any shared-interest token (capped) to surface
      // serendipitous pairs without rewarding identical profiles.
      pairs.push({ a, b, s });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  const chosen: MatchCandidate[] = [];
  // Always include top pairs + a few exploratory ones for serendipity.
  const topN = Math.min(limit, pairs.length);
  for (let i = 0; i < topN; i++) chosen.push({ a: pairs[i].a, b: pairs[i].b });
  // If fewer than limit due to small rooms, return all pairs.
  return chosen;
}

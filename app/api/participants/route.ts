import { NextResponse } from "next/server";
import { addParticipant, listParticipants, recordUsage, SPEND_GUARD, updateParticipant, getUsageTotals } from "@/lib/store";
import { aiEnabled, extractProfile } from "@/lib/openrouter";

const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

function sanitize(s: string, max = 300): string {
  return s.trim().replace(/\s+/g, " ").slice(0, max);
}

export async function GET() {
  const participants = await listParticipants();
  return NextResponse.json({ participants });
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = sanitize(String(body.name ?? ""));
  const title = sanitize(String(body.title ?? ""));
  const offers_text = sanitize(String(body.offers_text ?? ""));
  const needs_text = sanitize(String(body.needs_text ?? ""));
  const consent = body.consent === true;

  if (!name || !title || !offers_text || !needs_text) {
    return NextResponse.json(
      { error: "Name, what you do, what you can help with, and what you're looking for are all required." },
      { status: 400 }
    );
  }
  if (!consent) {
    return NextResponse.json(
      { error: "Please confirm consent to share your profile with attendees." },
      { status: 400 }
    );
  }

  // Spending guard before any inference.
  const usage = await getUsageTotals();
  if (usage.requests >= SPEND_GUARD.maxRequests) {
    return NextResponse.json(
      { error: `Inference request budget reached (${SPEND_GUARD.maxRequests}). Matching is paused to protect the $1 budget.` },
      { status: 403 }
    );
  }

  const participant = await addParticipant({
    name,
    title,
    offers_text,
    needs_text,
    profile: null,
    profile_source: "none",
    is_demo: false,
  });

  let ai_error: string | null = null;
  let profile_source: "muse-ember" | "raw" = "raw";

  if (aiEnabled()) {
    try {
      const res = await extractProfile(participant);
      await updateParticipant(participant.id, {
        profile: res.data,
        profile_source: "muse-ember",
      });
      await recordUsage({
        kind: "extract",
        participant_id: participant.id,
        requests: 1,
        prompt_tokens: res.usage.prompt_tokens,
        completion_tokens: res.usage.completion_tokens,
        total_tokens: res.usage.total_tokens,
        cost_usd: res.usage.cost_usd,
      });
      profile_source = "muse-ember";
      const fresh = (await listParticipants()).find((p) => p.id === participant.id);
      return NextResponse.json({
        participant: fresh ?? participant,
        ai_error: null,
        profile_source,
      });
    } catch (e) {
      ai_error = e instanceof Error ? e.message : "Profile extraction failed";
      // Fall through: participant saved with raw profile source, no fake AI.
    }
  } else {
    ai_error =
      "OPENROUTER_API_KEY is not configured — profile saved without AI extraction. Set OPENROUTER_API_KEY to enable Muse Ember matching.";
  }

  // Clearly labeled raw fallback (no invented structure beyond the user's own text).
  await updateParticipant(participant.id, { profile_source: "raw" });
  // Re-read for accurate response.
  const { getParticipant } = await import("@/lib/store");
  const fresh = (await getParticipant(participant.id)) ?? participant;
  return NextResponse.json({ participant: fresh, ai_error, profile_source });
}

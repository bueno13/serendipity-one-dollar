import { NextResponse } from "next/server";
import {
  getUsageTotals,
  listMatches,
  listParticipants,
  recordUsage,
  saveMatches,
  SPEND_GUARD,
} from "@/lib/store";
import {
  aiEnabled,
  evaluatePairs,
  selectCandidates,
  extractProfile,
} from "@/lib/openrouter";

/**
 * Evaluate candidate pairs with Muse Ember in batches.
 * - Extracts profiles for any participant missing one (batched, bounded).
 * - Deterministically selects candidate pairs, then scores via LLM.
 * - Persists results; skips already-scored pairs.
 */
export async function POST() {
  if (!aiEnabled()) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY is not configured. Set it in .env.local to enable Muse Ember matching. No matches were generated.",
      },
      { status: 503 }
    );
  }

  const usageBefore = await getUsageTotals();
  const remainingRequests = SPEND_GUARD.maxRequests - usageBefore.requests;
  if (remainingRequests <= 0) {
    return NextResponse.json(
      { error: `Request budget reached (${SPEND_GUARD.maxRequests}). Matching paused.` },
      { status: 403 }
    );
  }

  let participants = await listParticipants();
  if (participants.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 participants. Join or load demo profiles first." },
      { status: 400 }
    );
  }

  // Step 1: ensure profiles (bounded so we don't burn budget on extract).
  let profilesDone = 0;
  for (const p of participants) {
    if (p.profile || profilesDone >= 6) continue;
    if (profilesDone >= remainingRequests - 1) break;
    try {
      const res = await extractProfile(p);
      const { updateParticipant } = await import("@/lib/store");
      await updateParticipant(p.id, {
        profile: res.data,
        profile_source: "muse-ember",
      });
      await recordUsage({
        kind: "extract",
        participant_id: p.id,
        requests: 1,
        prompt_tokens: res.usage.prompt_tokens,
        completion_tokens: res.usage.completion_tokens,
        total_tokens: res.usage.total_tokens,
        cost_usd: res.usage.cost_usd,
      });
      profilesDone += 1;
    } catch (e) {
      console.error("extract failed for", p.id, e);
    }
  }
  participants = await listParticipants();

  // Step 2: candidate selection + skip cached pairs.
  const existing = await listMatches();
  const cached = new Set(
    existing.map((m) => [m.person_a_id, m.person_b_id].sort().join("|"))
  );
  const allCandidates = selectCandidates(participants, 40);
  const freshCandidates = allCandidates.filter(
    (c) => !cached.has([c.a.id, c.b.id].sort().join("|"))
  );

  const batches: typeof freshCandidates[] = [];
  for (let i = 0; i < freshCandidates.length; i += SPEND_GUARD.maxBatchPairs) {
    batches.push(freshCandidates.slice(i, i + SPEND_GUARD.maxBatchPairs));
  }
  // Reserve budget for at most 3 batch calls per request.
  const limitedBatches = batches.slice(0, Math.min(3, remainingRequests));

  const newMatches = [];
  const batchErrors: string[] = [];
  for (const batch of limitedBatches) {
    if (batch.length === 0) continue;
    try {
      const res = await evaluatePairs(batch);
      await recordUsage({
        kind: "match",
        participant_id: null,
        requests: 1,
        prompt_tokens: res.usage.prompt_tokens,
        completion_tokens: res.usage.completion_tokens,
        total_tokens: res.usage.total_tokens,
        cost_usd: res.usage.cost_usd,
      });
      for (const m of res.data) {
        // Only keep pairs that were actually requested.
        const key = [m.person_a_id, m.person_b_id].sort().join("|");
        const valid = batch.some(
          (c) => [c.a.id, c.b.id].sort().join("|") === key
        );
        if (!valid) continue;
        newMatches.push(m);
      }
    } catch (e) {
      // Graceful: a truncated/invalid batch must not fail the whole request.
      console.error("match batch failed, continuing:", e);
      batchErrors.push(e instanceof Error ? e.message : "batch failed");
    }
  }

  const saved = newMatches.length ? await saveMatches(newMatches) : [];
  const usageAfter = await getUsageTotals();
  if (saved.length === 0 && batchErrors.length > 0) {
    return NextResponse.json(
      {
        error:
          "Matching failed for all batches. " +
          batchErrors[0] +
          " No matches were persisted; no cost was recorded for failed batches.",
        evaluated: 0,
        evaluated_pairs: freshCandidates.length,
        matches: [],
        usage: usageAfter,
        model: "meta/muse-ember",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({
    evaluated: saved.length,
    evaluated_pairs: freshCandidates.length,
    matches: saved,
    usage: usageAfter,
    model: "meta/muse-ember",
    ...(batchErrors.length ? { batch_errors: batchErrors } : {}),
  });
}

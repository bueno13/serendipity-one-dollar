"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Interest, Match, Participant } from "@/lib/types";

export default function MatchesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-16 text-center text-white/60">
          Loading your matches…
        </main>
      }
    >
      <MatchesInner />
    </Suspense>
  );
}

function MatchesInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [all, setAll] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [interestMsg, setInterestMsg] = useState<Record<string, string>>({});

  async function load() {
    try {
      const [mRes, nRes] = await Promise.all([
        fetch(`/api/matches?participant_id=${encodeURIComponent(id)}`),
        fetch("/api/network"),
      ]);
      const mJson = (await mRes.json()) as {
        matches?: Match[];
        participant?: Participant;
        error?: string;
      };
      const nJson = (await nRes.json()) as {
        participants?: Participant[];
        interests?: Interest[];
      };
      if (!mRes.ok) {
        setError(mJson.error ?? "Participant not found.");
        return;
      }
      setParticipant(mJson.participant ?? null);
      setMatches((mJson.matches ?? []).sort((a, b) => b.score - a.score));
      setAll(nJson.participants ?? []);
      setInterests(nJson.interests ?? []);
    } catch {
      setError("Could not load matches. Is the server running?");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount syncs external API state
    load();
  }, [id]);

  async function runMatching() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch("/api/match-all", { method: "POST" });
      const json = (await res.json()) as { error?: string; evaluated?: number };
      if (!res.ok) {
        setRunMsg(json.error ?? "Matching failed.");
      } else {
        setRunMsg(`Evaluated ${json.evaluated ?? 0} new pair(s) with Muse Ember.`);
        await load();
      }
    } catch {
      setRunMsg("Network error while running matching.");
    } finally {
      setRunning(false);
    }
  }

  async function wantToMeet(otherId: string) {
    try {
      const res = await fetch("/api/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_id: id, to_id: otherId }),
      });
      const json = (await res.json()) as { mutual?: boolean; error?: string };
      if (!res.ok) {
        setInterestMsg((m) => ({ ...m, [otherId]: json.error ?? "Failed" }));
        return;
      }
      await load();
      setInterestMsg((m) => ({
        ...m,
        [otherId]: json.mutual ? "Mutual match — introduce yourselves!" : "Request sent.",
      }));
    } catch {
      setInterestMsg((m) => ({ ...m, [otherId]: "Network error" }));
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">{error}</h1>
        <Link href="/join" className="mt-4 inline-block rounded-full bg-white px-5 py-2 font-semibold text-black">
          Join the room →
        </Link>
      </main>
    );
  }

  if (!participant) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-white/60">
        Loading your matches…
      </main>
    );
  }

  const top3 = matches.slice(0, 3);
  const otherOf = (m: Match) => {
    const otherId = m.person_a_id === id ? m.person_b_id : m.person_a_id;
    return all.find((p) => p.id === otherId) ?? null;
  };
  const alreadyRequested = (otherId: string) =>
    interests.some((i) => i.from_id === id && i.to_id === otherId);
  const isMutual = (otherId: string) =>
    interests.some((i) => i.from_id === id && i.to_id === otherId) &&
    interests.some((i) => i.from_id === otherId && i.to_id === id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
        Your introductions
      </p>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">
        {participant.name}, meet your people
      </h1>
      <p className="mt-2 text-white/60">
        {participant.title} · Profile{" "}
        {participant.profile_source === "muse-ember"
          ? "analyzed by Muse Ember"
          : participant.profile_source === "raw"
            ? "saved (AI not configured)"
            : "pending analysis"}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={runMatching}
          disabled={running}
          className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {running ? "Muse Ember is reasoning…" : "Run Muse Ember matching →"}
        </button>
        <Link href="/" className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/80 hover:bg-white/10">
          Back to live network
        </Link>
        {runMsg && <span className="text-sm text-white/60">{runMsg}</span>}
      </div>

      {matches.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-white/20 p-8 text-center">
          <p className="text-lg font-semibold">No matches yet</p>
          <p className="mt-1 text-sm text-white/60">
            Hit “Run Muse Ember matching” — it analyzes offers &amp; needs (not
            job titles) and scores real complementarity. If it says the API key
            is missing, add <code className="rounded bg-white/10 px-1">OPENROUTER_API_KEY</code>.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {top3.map((m, idx) => {
            const other = otherOf(m);
            if (!other) return null;
            const mutual = isMutual(other.id);
            const requested = alreadyRequested(other.id);
            return (
              <article
                key={m.id}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 fade-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-bold text-violet-200">
                        #{idx + 1}
                      </span>
                      {mutual && (
                        <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-bold text-emerald-200">
                          Mutual match
                        </span>
                      )}
                      {other.is_demo && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                          demo data
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 text-2xl font-black">
                      Meet {other.name} — {m.score}% match
                    </h2>
                    <p className="mt-1 text-sm text-white/60">{other.title}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-black text-cyan-300">{m.score}</div>
                    <div className="text-xs text-white/50">/ 100</div>
                  </div>
                </div>
                <p className="mt-4 text-white/80">{m.reason}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-2xl bg-black/30 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-white/50">Value for you</div>
                    <p className="mt-1 text-white/80">{m.value_for_a || m.reason}</p>
                  </div>
                  <div className="rounded-2xl bg-black/30 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-white/50">Value for {other.name}</div>
                    <p className="mt-1 text-white/80">{m.value_for_b || m.reason}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/5 p-4 text-sm">
                  <span className="font-bold text-cyan-200">💬 Conversation starter: </span>
                  <span className="text-white/85">{m.conversation_starter}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => wantToMeet(other.id)}
                    disabled={requested}
                    className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {mutual ? "You’ve mutually opted in" : requested ? "Request sent ✓" : "I’d like to meet →"}
                  </button>
                  {interestMsg[other.id] && (
                    <span className="text-sm text-emerald-300">{interestMsg[other.id]}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

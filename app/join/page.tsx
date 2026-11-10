"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Participant } from "@/lib/types";

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [offers, setOffers] = useState("");
  const [needs, setNeeds] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAiError(null);
    if (!consent) {
      setError("Please confirm consent to share your profile with attendees.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          title,
          offers_text: offers,
          needs_text: needs,
          consent,
        }),
      });
      const json = (await res.json()) as {
        participant?: Participant;
        error?: string;
        ai_error?: string | null;
      };
      if (!res.ok || !json.participant) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      if (json.ai_error) setAiError(json.ai_error);
      try {
        localStorage.setItem("serendipity:participantId", json.participant.id);
      } catch {}
      router.push(`/matches/${json.participant.id}`);
    } catch {
      setError("Network error. Is the server running?");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/35 outline-none focus:border-cyan-300 focus:bg-white/10";
  const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60";

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="fade-up">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
          Join the room
        </p>
        <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
          Who should you meet <span className="text-shimmer">tonight?</span>
        </h1>
        <p className="mt-3 text-white/60">
          Tell us what you&apos;re building, what you can offer, and what you
          need. Muse Ember will find your people — for fractions of a cent.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="mt-8 space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-8"
      >
        <div>
          <label className={labelCls} htmlFor="name">Your name</label>
          <input
            id="name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            required
            maxLength={80}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="title">What do you do?</label>
          <input
            id="title"
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Building an AI startup for sales teams"
            required
            maxLength={300}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="offers">
            What can you help others with?
          </label>
          <textarea
            id="offers"
            className={inputCls}
            rows={3}
            value={offers}
            onChange={(e) => setOffers(e.target.value)}
            placeholder="AI engineering, product development"
            required
            maxLength={500}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="needs">
            What are you looking for?
          </label>
          <textarea
            id="needs"
            className={inputCls}
            rows={3}
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
            placeholder="Early customers, distribution, GTM expertise"
            required
            maxLength={500}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 accent-cyan-400"
          />
          <span>
            I consent to share my profile with other attendees so Muse Ember can
            suggest introductions. Contact details are never auto-shared.
          </span>
        </label>

        {error && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {aiError && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {aiError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-400 py-4 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Finding your people…" : "Find my people →"}
        </button>
        <p className="text-center text-xs text-white/40">
          No signup. Your profile is analyzed by Muse Ember via OpenRouter.
        </p>
      </form>
    </main>
  );
}

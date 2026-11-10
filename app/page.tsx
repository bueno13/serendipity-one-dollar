"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import type {
  Interest,
  Match,
  NetworkPayload,
  Participant,
} from "@/lib/types";
import { formatUsd } from "@/lib/format";

const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[520px] place-items-center rounded-3xl border border-white/10 bg-[#0a0d1f] text-white/50">
      Loading network…
    </div>
  ),
});

export default function Home() {
  const [data, setData] = useState<NetworkPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/network");
      const json = (await res.json()) as NetworkPayload;
      setData(json);
    } catch {
      // keep last-known data; show silent retry via polling
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount syncs external API state
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = envUrl ? `${envUrl.replace(/\/$/, "")}/join` : `${origin}/join`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- QR URL derives from window/env once on mount
    setQrUrl(url);
    if (url) {
      QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#05060f", light: "#ffffff" } })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    }
  }, []);

  const participants = data?.participants ?? [];
  const matches = data?.matches ?? [];
  const interests: Interest[] = data?.interests ?? [];
  const valuable = useMemo(() => matches.filter((m) => m.score >= 50), [matches]);
  const mutualCount = useMemo(() => {
    let n = 0;
    const set = new Set(interests.map((i) => `${i.from_id}|${i.to_id}`));
    for (const i of interests) {
      if (set.has(`${i.to_id}|${i.from_id}`)) n += 1;
    }
    return Math.floor(n / 2);
  }, [interests]);

  const usage = data?.usage;
  const cost = usage?.total_cost_usd ?? null;
  const progress = cost != null ? Math.min(100, (cost / 1.0) * 100) : null;

  const selected: Participant | undefined = participants.find((p) => p.id === selectedId);

  // Operator demo key (never stored server-side client bundle).
  // Stored only in sessionStorage for this tab; sent as x-demo-admin-key.
  const [demoKey, setDemoKey] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore operator key from sessionStorage on mount
      setDemoKey(sessionStorage.getItem("serendipity:demoAdminKey") ?? "");
    } catch {}
  }, []);
  function saveDemoKey(k: string) {
    setDemoKey(k);
    try {
      sessionStorage.setItem("serendipity:demoAdminKey", k);
    } catch {}
  }

  async function act(kind: "seed" | "reset" | "match") {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === "match") {
        const res = await fetch("/api/match-all", { method: "POST" });
        const json = (await res.json()) as { error?: string; evaluated?: number };
        if (!res.ok) setNotice(json.error ?? "Matching failed.");
        else setNotice(`Muse Ember evaluated ${json.evaluated ?? 0} new pair(s). Cost updated live below.`);
      } else {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (demoKey) headers["x-demo-admin-key"] = demoKey;
        const res = await fetch("/api/demo", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: kind }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setNotice(json.error ?? (kind === "reset" ? "Reset failed." : "Seed failed."));
        } else {
          setNotice(
            kind === "seed"
              ? "15 demo profiles loaded (labeled as demo). Now run Muse Ember matching."
              : "Room reset. All participants, matches and usage cleared."
          );
        }
      }
      await load();
    } catch {
      setNotice("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Hero */}
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
          Muse Ember · OpenRouter · meta/muse-ember
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          The right person is <span className="text-shimmer">already in the room.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/60 sm:text-lg">
          Muse Ember is uncovering the connections nobody knew existed —
          matching what people <em>need</em> with what others can <em>offer</em>.
        </p>
      </section>

      {/* Counters */}
      <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Counter label="People in the room" value={String(participants.length)} sub="participants joined" />
        <Counter label="Valuable connections" value={String(valuable.length)} sub={`of ${matches.length} evaluated pairs`} />
        <Counter label="Mutual introductions" value={String(mutualCount)} sub="both said “let’s meet”" />
        <div className="rounded-3xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/15 to-violet-500/15 p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-white/60">Muse Ember API cost</div>
          <div className="mt-1 text-3xl font-black text-cyan-200">{formatUsd(cost)}</div>
          <div className="mt-1 text-xs text-white/55">
            {usage ? `${usage.requests} requests · ${usage.total_tokens.toLocaleString()} tokens` : "—"}
          </div>
          {progress != null ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-white/55">
                {progress.toFixed(2)}% of the $1 budget${cost != null ? ` · $${(1 - cost).toFixed(6)} remaining` : ""}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              <div className="text-[11px] text-amber-200">{usage?.has_unavailable_cost ? "Cost unavailable — OpenRouter did not return verifiable cost" : "Set OPENROUTER_API_KEY to track live cost"}</div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2 rounded-full bg-white/40" />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI / storage status */}
      {data && !data.ai_enabled && (
        <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <span className="font-bold">Demo mode:</span> <code>OPENROUTER_API_KEY</code> is not
          configured, so Muse Ember matching is disabled and no matches are faked. Add{" "}
          <code>OPENROUTER_API_KEY=…</code> to <code>.env.local</code> and restart. Storage:{" "}
          <span className="font-semibold">{data.storage === "local" ? "local file (this device only)" : "Supabase"}</span>.
        </div>
      )}

      {/* Action bar */}
      <section className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="password"
          value={demoKey}
          onChange={(e) => saveDemoKey(e.target.value)}
          placeholder="Operator demo key (seed/reset)"
          autoComplete="off"
          className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-xs text-white placeholder:text-white/40 outline-none focus:border-cyan-300"
          title="Required to seed/reset when DEMO_ADMIN_KEY is set. Stored only in this tab."
        />
        <button
          onClick={() => act("seed")}
          disabled={busy != null}
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-50"
        >
          {busy === "seed" ? "Loading…" : "＋ Load 15 demo profiles"}
        </button>
        <button
          onClick={() => act("match")}
          disabled={busy != null}
          className="rounded-full bg-gradient-to-r from-violet-600 to-cyan-400 px-5 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy === "match" ? "Muse Ember reasoning…" : "Run Muse Ember matching →"}
        </button>
        <button
          onClick={() => act("reset")}
          disabled={busy != null}
          className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 hover:bg-white/5 disabled:opacity-50"
        >
          Reset room
        </button>
        {notice && <span className="text-sm text-white/65">{notice}</span>}
      </section>

      {/* Graph + side panels */}
      <section className="mt-6 grid gap-4 xl:grid-cols-[1fr_360px]">
        <NetworkGraph
          participants={participants}
          matches={matches}
          selectedId={selectedId}
          onSelectParticipant={setSelectedId}
          onSelectMatch={setSelectedMatch}
          selectedMatch={selectedMatch}
        />

        <aside className="space-y-4">
          {/* QR */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
            <div className="text-sm font-black tracking-wide">JOIN THE ROOM</div>
            <p className="text-xs text-white/55">Scan to join from your phone</p>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt={`QR code to join: ${qrUrl}`} className="mx-auto mt-3 h-44 w-44 rounded-2xl bg-white p-1" />
            ) : (
              <div className="mx-auto mt-3 grid h-44 w-44 place-items-center rounded-2xl bg-white/10 text-xs text-white/50">Generating…</div>
            )}
            <Link href="/join" className="mt-3 inline-block rounded-full bg-white px-5 py-2 text-sm font-bold text-black">
              Open /join →
            </Link>
            <div className="mt-2 break-all text-[11px] text-white/40">{qrUrl || "…"}</div>
          </div>

          {/* Selected participant */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-white/50">Profile</div>
              {selected?.is_demo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">demo data</span>}
            </div>
            {selected ? (
              <div className="mt-2">
                <h3 className="text-xl font-black">{selected.name}</h3>
                <p className="mt-1 text-sm text-white/70">{selected.title}</p>
                <div className="mt-3 space-y-2 text-sm text-white/70">
                  <p><span className="font-bold text-white/90">Offers:</span> {selected.profile ? selected.profile.offers.join(", ") || "—" : selected.offers_text}</p>
                  <p><span className="font-bold text-white/90">Needs:</span> {selected.profile ? selected.profile.needs.join(", ") || "—" : selected.needs_text}</p>
                  {selected.profile && (
                    <p className="text-xs text-white/45">Role: {selected.profile.role} · {selected.profile.industry} · Source: {selected.profile_source}</p>
                  )}
                </div>
                <Link href={`/matches/${selected.id}`} className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-xs font-bold text-black">
                  View top matches for {selected.name.split(" ")[0]} →
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/55">Click a glowing node to preview a profile. Click a dashed line to see <em>why</em> they should meet.</p>
            )}
            {selectedMatch && (
              <div className="mt-4 rounded-2xl bg-black/40 p-4 text-sm">
                <div className="font-bold">{selectedMatch.score}% — why</div>
                <p className="mt-1 text-white/75">{selectedMatch.reason}</p>
                <p className="mt-2 text-xs text-cyan-200">“{selectedMatch.conversation_starter}”</p>
              </div>
            )}
          </div>

          {/* Top connections list */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-white/50">Top connections</div>
            <div className="mt-3 space-y-2">
              {[...matches].sort((a, b) => b.score - a.score).slice(0, 5).map((m) => {
                const a = participants.find((p) => p.id === m.person_a_id);
                const b = participants.find((p) => p.id === m.person_b_id);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMatch(m);
                      setSelectedId(null);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left hover:border-cyan-300/40"
                  >
                    <span className="text-sm font-semibold">{a?.name} ↔ {b?.name}</span>
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs font-bold text-cyan-200">{m.score}%</span>
                  </button>
                );
              })}
              {matches.length === 0 && (
                <p className="text-sm text-white/50">No evaluated pairs yet. Load demo profiles, then run Muse Ember matching.</p>
              )}
            </div>
          </div>
        </aside>
      </section>

      <p className="mt-6 text-center text-xs text-white/40">
        Polled every 5s · Model <span className="text-white/70">meta/muse-ember</span> via OpenRouter · Usage captured from{" "}
        <code>usage: {"{ include: true }"}</code> — counts are never invented.
      </p>
    </main>
  );
}

function Counter({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-xs font-bold uppercase tracking-wide text-white/55">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      <div className="mt-1 text-xs text-white/50">{sub}</div>
    </div>
  );
}

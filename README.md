# Serendipity — The $1 Networking Brain

> **The right person is already in the room.**

A hackathon serendipity engine that uses **Muse Ember through OpenRouter**
(`meta/muse-ember`) to discover valuable, non-obvious introductions at a
networking event — and proves it can do so for under $1 in runtime inference.

## What it does

1. Attendees scan a QR code → describe who they are, what they offer, and what they need.
2. Muse Ember extracts a structured profile, then evaluates complementary pairs
   on value / complementarity / mutual benefit / serendipity (0–100).
3. Each person gets their **top 3 introductions** with a concrete conversation starter.
4. A **live network graph** visualizes the hidden connections in the room.
5. Every API call is tracked with **real OpenRouter usage + cost** and shown
   against the $1 budget — never invented.

There are no mock AI responses in production paths. If `OPENROUTER_API_KEY`
is missing, the UI says so and matching stays disabled.

## Tech stack

- Next.js App Router + TypeScript + Tailwind CSS v4
- Supabase (optional, shared persistence) with local-file fallback for demos
- OpenRouter API (`meta/muse-ember`, `usage: { include: true }`)
- Custom SVG force graph (no graph library) + `qrcode` for onboarding QR
- Vercel-compatible (single `npm run build` output)

## Screens

| Route | Purpose |
|---|---|
| `/` | Live Network — hero projector screen: graph, counters, $1 progress bar, QR code, demo controls |
| `/join` | Mobile-first join form (name / what I do / offers / needs + consent) |
| `/matches/[id]` | Personal top-3 matches + “I’d like to meet” → mutual-match tracking |

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# Edit .env.local — at minimum add:
#   OPENROUTER_API_KEY=...        (from https://openrouter.ai/keys)
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
npm run dev
# Open http://localhost:3000
```

Demo flow (60 seconds):

1. On `/`, click **“+ Load 15 demo profiles”** (Founder, GTM engineer, investor,
   designer, etc. — labeled *demo data*).
2. Click **“Run Muse Ember matching →”** and watch the $ cost meter tick up.
3. Click glowing nodes / dashed edges to see *why* two people should meet.
4. Scan the QR (or open `/join` on your phone), add yourself, and watch the graph update.
5. Open `/matches/<your-id>` for your 3 tailored introductions.

Without an API key you can still join, seed demo profiles, and browse the graph
— but no matches are generated (the app never pretends otherwise).

## Required environment variables

| Variable | Required | What for |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes for AI | Server-only key for Muse Ember. Never exposed to the browser. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public URL for QR code + OpenRouter referer (set to your Vercel URL in prod). |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Enables shared storage. If unset → local mode (`data/store.json`, this device only). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key (safe in browser, used server-side here). |
| `SUPABASE_SERVICE_ROLE_KEY` | No (server alt) | Server-only Supabase key; preferred for API routes. Never prefix with `NEXT_PUBLIC_`. |

See `.env.example`.

## Enabling Supabase (multi-user persistence)

Local mode writes to `data/store.json` (gitignored) and is **not** shared across
devices or meaningful on Vercel. To enable real multi-user storage:

1. Create a project at https://supabase.com
2. Run `supabase/schema.sql` in the SQL editor (creates `participants`,
   `matches`, `interests`, `api_usage`).
3. Add the 3 Supabase vars to `.env.local` (and to Vercel → Project Settings → Environment Variables).
4. Restart. The home page will report `Storage: Supabase`.

The app reads Supabase when `NEXT_PUBLIC_SUPABASE_URL` + a key are present;
otherwise it uses local mode — labeled as such in the UI.

## Deployment (Vercel)

```bash
vercel env add OPENROUTER_API_KEY production
vercel env add NEXT_PUBLIC_APP_URL production
# (optional) Supabase vars
vercel deploy --prod
```

Then set `NEXT_PUBLIC_APP_URL` to your deployed URL and redeploy so the QR
code points at production `/join`.

## How the $1 cost tracker works

- Every OpenRouter response uses `usage: { include: true }`.
- The server captures `prompt_tokens`, `completion_tokens`, `total_tokens`,
  and `cost_usd` (`usage.cost ?? cost`) when OpenRouter returns verifiable cost.
- Records persist in `api_usage` (Supabase) or `data/store.json` (local) to
  avoid double counting on re-renders.
- If cost is unavailable, the UI shows **“Cost unavailable”** — it never invents a number.
- Guards: max **100 requests**, max batch **12 pairs/call**, bounded outputs
  (extract 400 tokens, matches 900), cached pair scores (already-scored pairs
  are skipped). Target: keep the whole demo under $1.
- Coding-agent build costs are **not** counted — only runtime app inference.

## AI matching engine

**Step A — Profile extraction** (`lib/openrouter.ts`):

```json
{ "role": "", "industry": "", "skills": [], "offers": [], "needs": [], "interests": [] }
```

**Step B — Candidate selection:** deterministic keyword overlap between one
person’s offers and another’s needs (and vice versa) — keeps us from paying
to score every O(n²) pair.

**Step C — Match evaluation:** batched Muse Ember prompts scored 0–100
(practical value 35 / complementarity 25 / mutual benefit 20 / serendipity 20),
returning `{ person_a_id, person_b_id, score, reason, value_for_a, value_for_b, conversation_starter }`
validated server-side. Results are persisted so the graph never needs re-scoring.

## Project structure

```text
app/
  page.tsx                 # Live Network (/)
  join/page.tsx            # Join (/join)
  matches/[id]/page.tsx    # Personal matches (/matches/:id)
  api/participants/        # POST join (extracts profile via Muse Ember)
  api/matches/             # GET matches (+ optional participant filter)
  api/match-all/           # POST batch matching (extract → select → evaluate)
  api/network/             # GET participants + matches + interests + usage
  api/usage/               # GET usage totals + budget
  api/demo/                # POST seed (15 demo profiles) / reset
  api/interests/           # POST "I'd like to meet" (mutual detection)
components/NetworkGraph.tsx# SVG force-directed graph
lib/
  openrouter.ts            # Muse Ember client + candidate filter
  store.ts                 # Local-file ⇄ Supabase abstraction + spend guard
  demo.ts                  # 15 fictional demo profiles
  types.ts / format.ts
supabase/schema.sql        # participants / matches / interests / api_usage
```

## Safety & rate limiting

- API key is server-only (`process.env.OPENROUTER_API_KEY` in route handlers).
- `/api/participants` is input-validated (trimmed, capped) + rate-limited
  (10 POSTs/min/IP in-memory).
- Consent checkbox required before any profile is shared.
- Contact details are never auto-exposed; introductions require opt-in from both sides.

## What’s implemented vs. remaining

- ✅ Join → extraction → matching → personal matches → live graph → cost tracker
- ✅ Demo mode with 15 realistic profiles + reset
- ✅ QR onboarding, mutual-match opt-in, edge explanations
- ✅ Supabase schema + optional Supabase runtime path (needs your project keys to verify live)
- ⏳ Post-hackathon polish: auth (deliberately omitted), email notifications,
  production RLS hardening, e2e tests, PWA install prompt

## License

Hackathon prototype. Demo profiles are fictional; real participant data stays
in your own Supabase / local store.

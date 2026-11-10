import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type {
  Interest,
  Match,
  Participant,
  UsageRecord,
  UsageTotals,
} from "./types";
import { demoParticipants } from "./demo";
import {
  getSupabase,
  isSupabaseConfigured,
  publishableKey,
  secretKey,
  supabaseUrl,
} from "./supabase-server";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

interface StoreFile {
  participants: Participant[];
  matches: Match[];
  interests: Interest[];
  usage: UsageRecord[];
}

const EMPTY: StoreFile = {
  participants: [],
  matches: [],
  interests: [],
  usage: [],
};

// Back-compat + descriptive names. Primary check is isSupabaseConfigured().
function supabaseEnabled(): boolean {
  return isSupabaseConfigured();
}

export function storageMode(): "supabase" | "local" {
  return supabaseEnabled() ? "supabase" : "local";
}

export { isSupabaseConfigured, publishableKey, secretKey, supabaseUrl };

/** Wrap a Supabase error so failures are loud (no silent local fallback). */
function supabaseError(op: string, error: unknown): Error {
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: unknown }).message)
        : "unknown error";
  return new Error(`Supabase ${op} failed: ${msg}`);
}

async function readFileStore(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    return {
      participants: parsed.participants ?? [],
      matches: parsed.matches ?? [],
      interests: parsed.interests ?? [],
      usage: parsed.usage ?? [],
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeFileStore(store: StoreFile): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.error("store write failed:", e);
  }
}

// Serialize local writes in-process to avoid interleaved read-modify-write.
let writeQueue: Promise<unknown> = Promise.resolve();
async function mutate<T>(fn: (store: StoreFile) => T): Promise<T> {
  const run = async () => {
    const store = await readFileStore();
    const result = fn(store);
    await writeFileStore(store);
    return result;
  };
  const p = writeQueue.then(run, run);
  writeQueue = p.catch(() => undefined);
  return p;
}

export async function listParticipants(): Promise<Participant[]> {
  if (supabaseEnabled()) {
    // Fail-closed: if Supabase is configured, never silently use local data.
    const sb = getSupabase();
    const { data, error } = await sb
      .from("participants")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw supabaseError("listParticipants", error);
    return (data ?? []) as Participant[];
  }
  const store = await readFileStore();
  return store.participants;
}

export async function getParticipant(id: string): Promise<Participant | null> {
  const all = await listParticipants();
  return all.find((p) => p.id === id) ?? null;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Canonical pair ordering so DB unique(person_a_id, person_b_id) dedupes (A,B) vs (B,A). */
export function canonicalPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

export async function addParticipant(
  p: Omit<Participant, "id" | "created_at">
): Promise<Participant> {
  const participant: Participant = {
    ...p,
    id: newId(),
    created_at: new Date().toISOString(),
  };
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { error } = await sb
      .from("participants")
      .insert(participant as unknown as never);
    if (error) throw supabaseError("addParticipant", error);
    return participant;
  }
  await mutate((s) => {
    s.participants.push(participant);
  });
  return participant;
}

export async function updateParticipant(
  id: string,
  patch: Partial<Participant>
): Promise<Participant | null> {
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("participants")
      .update(patch as unknown as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw supabaseError("updateParticipant", error);
    return data as Participant;
  }
  let updated: Participant | null = null;
  await mutate((s) => {
    const idx = s.participants.findIndex((p) => p.id === id);
    if (idx >= 0) {
      s.participants[idx] = { ...s.participants[idx], ...patch };
      updated = s.participants[idx];
    }
  });
  return updated;
}

export async function listMatches(): Promise<Match[]> {
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("matches")
      .select("*")
      .order("score", { ascending: false });
    if (error) throw supabaseError("listMatches", error);
    return (data ?? []) as Match[];
  }
  const store = await readFileStore();
  return store.matches;
}

export async function saveMatches(
  newMatches: Omit<Match, "id" | "created_at">[]
) {
  // Canonicalize every pair so the DB unique constraint dedupes reversed pairs.
  const canonical = newMatches.map((m) => {
    const [a, b] = canonicalPair(m.person_a_id, m.person_b_id);
    return { ...m, person_a_id: a, person_b_id: b };
  });
  const toSave: Match[] = canonical.map((m) => ({
    ...m,
    id: newId(),
    created_at: new Date().toISOString(),
  }));
  if (supabaseEnabled()) {
    const sb = getSupabase();
    // Upsert on the pair: re-scoring a pair updates the row instead of duplicating.
    // Requires unique(person_a_id, person_b_id) in the schema (see supabase/schema.sql).
    const { error } = await sb
      .from("matches")
      .upsert(toSave as unknown as never[], {
        onConflict: "person_a_id,person_b_id",
      });
    if (error) throw supabaseError("saveMatches", error);
    // Return canonical saved rows.
    return toSave;
  }
  await mutate((s) => {
    for (const m of toSave) {
      const idx = s.matches.findIndex(
        (x) =>
          (x.person_a_id === m.person_a_id &&
            x.person_b_id === m.person_b_id) ||
          (x.person_a_id === m.person_b_id && x.person_b_id === m.person_a_id)
      );
      if (idx >= 0) s.matches[idx] = m;
      else s.matches.push(m);
    }
  });
  return toSave;
}

export async function listInterests(): Promise<Interest[]> {
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { data, error } = await sb.from("interests").select("*");
    if (error) throw supabaseError("listInterests", error);
    return (data ?? []) as Interest[];
  }
  const store = await readFileStore();
  return store.interests;
}

export async function addInterest(
  from_id: string,
  to_id: string
): Promise<Interest> {
  const existing = await listInterests();
  const dup = existing.find((i) => i.from_id === from_id && i.to_id === to_id);
  if (dup) return dup;
  const interest: Interest = {
    id: newId(),
    from_id,
    to_id,
    created_at: new Date().toISOString(),
  };
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { error } = await sb
      .from("interests")
      .insert(interest as unknown as never);
    if (error) {
      // Unique violation means a concurrent insert won; return existing.
      const code = (error as { code?: unknown }).code;
      if (code === "23505") {
        const fresh = await listInterests();
        const race = fresh.find(
          (i) => i.from_id === from_id && i.to_id === to_id
        );
        if (race) return race;
      }
      throw supabaseError("addInterest", error);
    }
    return interest;
  }
  await mutate((s) => {
    if (!s.interests.some((i) => i.from_id === from_id && i.to_id === to_id)) {
      s.interests.push(interest);
    }
  });
  return interest;
}

export async function recordUsage(
  rec: Omit<UsageRecord, "id" | "created_at">
): Promise<UsageRecord> {
  const record: UsageRecord = {
    ...rec,
    id: newId(),
    created_at: new Date().toISOString(),
  };
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { error } = await sb
      .from("api_usage")
      .insert(record as unknown as never);
    if (error) throw supabaseError("recordUsage", error);
    return record;
  }
  await mutate((s) => {
    s.usage.push(record);
  });
  return record;
}

function totalsFrom(records: UsageRecord[]): UsageTotals {
  let requests = 0,
    prompt_tokens = 0,
    completion_tokens = 0,
    total_tokens = 0;
  let total_cost_usd: number = 0;
  let has_unavailable = false;
  for (const r of records) {
    requests += r.requests;
    prompt_tokens += r.prompt_tokens;
    completion_tokens += r.completion_tokens;
    total_tokens += r.total_tokens;
    if (r.cost_usd == null) has_unavailable = true;
    else total_cost_usd += r.cost_usd;
  }
  return {
    requests,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    total_cost_usd: has_unavailable ? null : total_cost_usd,
    has_unavailable_cost: has_unavailable,
    records,
  };
}

export async function getUsageTotals(): Promise<UsageTotals> {
  if (supabaseEnabled()) {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("api_usage")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw supabaseError("getUsageTotals", error);
    return totalsFrom((data ?? []) as UsageRecord[]);
  }
  const store = await readFileStore();
  return totalsFrom(store.usage);
}

// Spending guard: hard caps to avoid runaway inference cost.
// Output caps include hidden reasoning tokens (Muse Ember is reasoning-heavy).
export const SPEND_GUARD = {
  maxRequests: 100,
  budgetUsd: 1.0,
  maxExtractOutputTokens: 800,
  maxMatchOutputTokens: 4000,
  maxBatchPairs: 8,
};

// --- Demo seeding (idempotent, works in BOTH local and Supabase modes) ---
export async function seedDemo(): Promise<{ added: number; total: number }> {
  const seeds = demoParticipants();
  if (supabaseEnabled()) {
    const sb = getSupabase();
    // Idempotent: insert only missing demo IDs.
    const { data: existing, error: listErr } = await sb
      .from("participants")
      .select("id");
    if (listErr) throw supabaseError("seedDemo list", listErr);
    const have = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    const missing = seeds.filter((p) => !have.has(p.id));
    if (missing.length > 0) {
      const { error } = await sb
        .from("participants")
        .insert(missing as unknown as never[]);
      if (error) throw supabaseError("seedDemo insert", error);
    }
    const { count, error: countErr } = await sb
      .from("participants")
      .select("*", { count: "exact", head: true });
    if (countErr) throw supabaseError("seedDemo count", countErr);
    return { added: missing.length, total: count ?? 0 };
  }
  const store = await readFileStore();
  let added = 0;
  for (const p of seeds) {
    if (!store.participants.some((x) => x.id === p.id)) {
      store.participants.push(p);
      added += 1;
    }
  }
  await writeFileStore(store);
  return { added, total: store.participants.length };
}

export async function resetAll(): Promise<void> {
  if (supabaseEnabled()) {
    // Delete children before parents (FK order). neq('id','') matches all rows.
    const sb = getSupabase();
    for (const table of ["matches", "interests", "api_usage", "participants"] as const) {
      const { error } = await sb.from(table).delete().neq("id", "");
      if (error) throw supabaseError(`resetAll delete ${table}`, error);
    }
    return;
  }
  await writeFileStore(structuredClone(EMPTY));
}

export const computeTotals = totalsFrom;

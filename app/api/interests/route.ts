import { NextResponse } from "next/server";
import { addInterest, getParticipant, listInterests } from "@/lib/store";

function sanitize(s: string): string {
  return s.trim().slice(0, 120);
}

export async function GET() {
  const interests = await listInterests();
  return NextResponse.json({ interests });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const from_id = sanitize(String(body.from_id ?? ""));
  const to_id = sanitize(String(body.to_id ?? ""));
  if (!from_id || !to_id) {
    return NextResponse.json({ error: "from_id and to_id are required." }, { status: 400 });
  }
  if (from_id === to_id) {
    return NextResponse.json({ error: "Cannot request a meeting with yourself." }, { status: 400 });
  }
  const [from, to] = await Promise.all([
    getParticipant(from_id),
    getParticipant(to_id),
  ]);
  if (!from || !to) {
    return NextResponse.json({ error: "Participant not found." }, { status: 404 });
  }
  const interest = await addInterest(from_id, to_id);
  const all = await listInterests();
  const mutual = all.some((i) => i.from_id === to_id && i.to_id === from_id);
  return NextResponse.json({ interest, mutual });
}

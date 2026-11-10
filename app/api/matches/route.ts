import { NextResponse } from "next/server";
import { getParticipant, listMatches } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const participantId = url.searchParams.get("participant_id");
  const matches = await listMatches();
  if (!participantId) {
    return NextResponse.json({ matches });
  }
  const participant = await getParticipant(participantId);
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }
  const filtered = matches.filter(
    (m) => m.person_a_id === participantId || m.person_b_id === participantId
  );
  return NextResponse.json({ matches: filtered, participant });
}

import { NextResponse } from "next/server";
import {
  getUsageTotals,
  listInterests,
  listMatches,
  listParticipants,
  storageMode,
} from "@/lib/store";
import { aiEnabled } from "@/lib/openrouter";

export async function GET() {
  const [participants, matches, interests, usage] = await Promise.all([
    listParticipants(),
    listMatches(),
    listInterests(),
    getUsageTotals(),
  ]);
  return NextResponse.json({
    participants,
    matches,
    interests,
    usage,
    ai_enabled: aiEnabled(),
    storage: storageMode(),
  });
}

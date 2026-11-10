import { NextResponse } from "next/server";
import { getUsageTotals, SPEND_GUARD } from "@/lib/store";

export async function GET() {
  const usage = await getUsageTotals();
  return NextResponse.json({ usage, budget_usd: SPEND_GUARD.budgetUsd, max_requests: SPEND_GUARD.maxRequests });
}

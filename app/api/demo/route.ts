import { NextResponse } from "next/server";
import { resetAll, seedDemo } from "@/lib/store";

/**
 * Operator-only demo controls.
 *
 * Seed loads 15 demo profiles; reset deletes ALL participants, matches,
 * interests and usage. Both must be protected from unauthenticated public
 * access — anyone on the internet could otherwise wipe the room.
 *
 * Auth: header `x-demo-admin-key` (preferred) or JSON body `admin_key`
 * must equal process.env.DEMO_ADMIN_KEY (server-only).
 *
 * Fail-closed policy:
 *  - If DEMO_ADMIN_KEY is unset:
 *    - In production (NODE_ENV=production or VERCEL) -> 503, blocked.
 *    - In local development -> allowed with a server log warning
 *      (convenience so `npm run dev` demos work without extra setup).
 *  - If DEMO_ADMIN_KEY is set: require a match in ALL environments.
 */
function checkAdmin(req: Request, body: Record<string, unknown>): { ok: boolean; status?: number; error?: string } {
  const expected = process.env.DEMO_ADMIN_KEY || process.env.ADMIN_SECRET;
  const headerKey = req.headers.get("x-demo-admin-key");
  const bodyKey = typeof body?.admin_key === "string" ? body.admin_key : null;
  const provided = headerKey || bodyKey || "";
  if (!expected) {
    const inProd =
      process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
    if (inProd) {
      return {
        ok: false,
        status: 503,
        error:
          "Demo controls disabled: DEMO_ADMIN_KEY is not configured. Set DEMO_ADMIN_KEY server-side to enable seed/reset.",
      };
    }
    console.warn(
      "[demo] DEMO_ADMIN_KEY not set — allowing seed/reset in local development only. Set DEMO_ADMIN_KEY to protect these endpoints."
    );
    return { ok: true };
  }
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Unauthorized: missing or invalid demo admin key." };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // empty body defaults to seed
  }
  const action = String(body.action ?? "seed");

  const auth = checkAdmin(req, body);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }

  try {
    if (action === "reset") {
      await resetAll();
      return NextResponse.json({ ok: true, action: "reset" });
    }
    if (action === "seed") {
      const result = await seedDemo();
      return NextResponse.json({ ok: true, action: "seed", ...result });
    }
    return NextResponse.json(
      { error: "Unknown action. Use seed or reset." },
      { status: 400 }
    );
  } catch (e) {
    // Database failures must surface, never silently fall back.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Demo operation failed" },
      { status: 500 }
    );
  }
}

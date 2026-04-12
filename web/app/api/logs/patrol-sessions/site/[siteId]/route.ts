import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const days = Math.min(
      60,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "10", 10) || 10)
    );
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = await convex.query(api.patrolSessions.listForSiteSince, {
      siteId: siteId as Id<"sites">,
      since,
    });
    return NextResponse.json(rows);
  } catch (e: unknown) {
    console.error("[API] patrol-sessions/site", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

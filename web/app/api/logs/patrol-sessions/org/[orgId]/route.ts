import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const days = Math.min(
      60,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "60", 10) || 60)
    );
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = await convex.query(
      api.patrolSessions.listCompletedSessionsForOrgSince,
      {
        organizationId: orgId as Id<"organizations">,
        since,
      }
    );
    return NextResponse.json(rows);
  } catch (e: unknown) {
    console.error("[API] patrol-sessions/org", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

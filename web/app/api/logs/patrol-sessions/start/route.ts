import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const guardId = body.guardId ?? body.userId;
    const { siteId, organizationId } = body;
    if (!guardId || !siteId || !organizationId) {
      return NextResponse.json(
        { error: "guardId, siteId, and organizationId required" },
        { status: 400 }
      );
    }
    const id = await convex.mutation(api.patrolSessions.startSession, {
      guardId: guardId as Id<"users">,
      siteId: siteId as Id<"sites">,
      organizationId: organizationId as Id<"organizations">,
    });
    return NextResponse.json({ sessionId: id });
  } catch (e: unknown) {
    console.error("[API] patrol-sessions/start", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId as string | undefined;
    const pointId = body.pointId as string | undefined;
    if (!sessionId || !pointId) {
      return NextResponse.json({ error: "sessionId and pointId required" }, { status: 400 });
    }
    await convex.mutation(api.patrolSessions.appendScannedPoint, {
      sessionId: sessionId as Id<"patrolSessions">,
      pointId: pointId as Id<"patrolPoints">,
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[API] session/points/update", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

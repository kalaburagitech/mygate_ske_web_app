import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const result = await convex.mutation(api.patrolSessions.endSession, {
      sessionId: sessionId as Id<"patrolSessions">,
    });
    return NextResponse.json({ ok: true, discarded: result?.discarded === true });
  } catch (e: unknown) {
    console.error("[API] session end", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    const { logId } = await params;
    const body = await req.json();
    const patch: {
      logId: Id<"visitLogs">;
      userId: Id<"users">;
      latitude: number;
      longitude: number;
      accuracyM?: number;
    } = {
      logId: logId as Id<"visitLogs">,
      userId: body.userId as Id<"users">,
      latitude: body.latitude,
      longitude: body.longitude,
    };
    if (body.accuracyM != null && Number.isFinite(body.accuracyM)) {
      patch.accuracyM = body.accuracyM;
    }
    await convex.mutation(api.logs.visitCheckOut, patch);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[API] visit checkout", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

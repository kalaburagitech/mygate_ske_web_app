import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  console.log("[API] POST /api/logs/patrol - Request received");
  try {
    const body = await req.json();
    const result = await convex.mutation(api.logs.createPatrolLog, body);
    console.log("[API] POST /api/logs/patrol - Success:", result);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[API] Logs patrol error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    const client =
      /already scanned|checkpoint|patrol session/i.test(msg) ||
      msg.length < 200;
    return NextResponse.json({ error: msg }, { status: client ? 400 : 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await convex.mutation(api.logs.createVisitLog, body);
    return NextResponse.json({ visitLogId: result });
  } catch (e: unknown) {
    console.error("[API] POST /api/logs/visit", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

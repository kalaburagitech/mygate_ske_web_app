import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[API] POST /api/logs/dual - Request received:", body);
    const result = await convex.mutation(api.logs.createDualLog, body);
    console.log("[API] POST /api/logs/dual - Success:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] Logs dual error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

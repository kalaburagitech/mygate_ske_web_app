import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    console.log(`[API] GET /api/logs/patrol/user/${userId} - Request received`);
    const logs = await convex.query(api.logs.listPatrolLogsByUser, { userId: userId as Id<"users"> });
    console.log(`[API] GET /api/logs/patrol/user/${userId} - Success: ${logs?.length || 0} logs found`);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("[API] Logs Patrol User error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

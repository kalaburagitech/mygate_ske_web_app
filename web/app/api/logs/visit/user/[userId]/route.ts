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
    const sinceRaw = req.nextUrl.searchParams.get("since");
    const since = sinceRaw ? parseInt(sinceRaw, 10) : undefined;
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const logs = await convex.query(api.logs.listVisitLogsByUser, {
      userId: userId as Id<"users">,
      since: typeof since === "number" && Number.isFinite(since) ? since : undefined,
      limit: typeof limit === "number" && Number.isFinite(limit) ? limit : undefined,
    });
    console.log(`[API] GET /api/logs/visit/user/${userId} - Success: ${logs?.length || 0} logs found`);
    return NextResponse.json(logs);
  } catch (error) {
    console.error("[API] Logs Visit User error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

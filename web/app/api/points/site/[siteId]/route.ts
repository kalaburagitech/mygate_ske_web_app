import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    console.log(`[API] GET /api/points/site/${siteId} - Request received`);
    const points = await convex.query(api.sites.listPatrolPointsBySite, { 
      siteId: siteId as Id<"sites"> 
    });
    console.log(`[API] GET /api/points/site/${siteId} - Success: ${points.length} points found`);
    return NextResponse.json(points);
  } catch (error: any) {
    console.error("[API] Points Site error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

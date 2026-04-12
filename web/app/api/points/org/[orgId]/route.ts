import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const points = await convex.query(api.patrolPoints.listByOrg, { organizationId: orgId as Id<"organizations"> });
    console.log(`[API] GET /api/points/org/${orgId} - Success: ${points?.length || 0} points found`);
    return NextResponse.json(points);
  } catch (error: any) {
    console.error("[API] Points Org error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

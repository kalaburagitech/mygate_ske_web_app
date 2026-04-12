import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const siteIdsStr = searchParams.get("siteIds");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const siteIds = siteIdsStr ? siteIdsStr.split(",") : undefined;
    
    const data = await convex.query(api.clientDashboard.getClientDashboardData, {
      userId: userId as any,
      siteIds: siteIds as any,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API] Client Dashboard Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}

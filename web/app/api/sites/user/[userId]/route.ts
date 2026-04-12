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
    const { searchParams } = new URL(req.url);
    const regionId = searchParams.get("regionId");
    const city = searchParams.get("city");

    console.log(`[API] GET /api/sites/user/${userId} - Request received (regionId: ${regionId || 'none'}, city: ${city || 'none'})`);
    const sites = await convex.query(api.sites.listSitesByUser, { 
      userId: userId as Id<"users">,
      regionId: regionId || undefined,
      city: city || undefined
    });
    console.log(`[API] GET /api/sites/user/${userId} - Success: ${sites?.length || 0} sites found`);
    return NextResponse.json(sites);
  } catch (error: any) {
    console.error("[API] Sites User error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

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
    const { searchParams } = new URL(req.url);
    const regionId = searchParams.get("regionId");
    const city = searchParams.get("city");

    console.log(`[API] GET /api/sites/org/${orgId} - Request received (regionId: ${regionId}, city: ${city})`);
    const sites = await convex.query(api.sites.listSitesByOrg, { 
      organizationId: orgId as Id<"organizations">,
      regionId: regionId || undefined,
      city: city || undefined
    });
    console.log(`[API] GET /api/sites/org/${orgId} - Success: ${sites?.length || 0} sites found`);
    return NextResponse.json(sites);
  } catch (error) {
    console.error("[API] Sites Org error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body;
    console.log(`[API] POST /api/sites/list - Request received with ${ids?.length || 0} ids`);

    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
    }

    const sites = await convex.query(api.sites.listSitesByIds, { ids });
    console.log(`[API] POST /api/sites/list - Success: ${sites?.length || 0} sites found`);
    return NextResponse.json(sites);
  } catch (error) {
    console.error("[API] Sites List error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

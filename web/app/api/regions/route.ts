import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function GET() {
  console.log("[API] GET /api/regions - Request received");
  try {
    const regions = await convex.query(api.regions.list);
    console.log(`[API] GET /api/regions - Success: ${regions.length} regions found`);
    return NextResponse.json(regions);
  } catch (error) {
    console.error("[API] Regions error:", error);
    return NextResponse.json({ error: "Internal server error" }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const regionId = await convex.mutation(api.regions.create, body);
    return NextResponse.json({ regionId });
  } catch (error: any) {
    console.error("[API] Create Region error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

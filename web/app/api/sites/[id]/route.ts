import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const site = await convex.query(api.sites.getSite, { id: id as Id<"sites"> });
    return NextResponse.json(site);
  } catch (error) {
    console.error("[API] Site ID error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

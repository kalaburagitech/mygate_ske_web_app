import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const rows = await convex.query(
      api.patrolSessions.summariesBySubjectEmpIdAtSite,
      {
        siteId: siteId as Id<"sites">,
      }
    );
    return NextResponse.json(rows ?? {});
  } catch (e: unknown) {
    console.error("[API] subject-summaries", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

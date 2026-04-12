import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api.js";
import { corsHeaders } from "@/lib/cors";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const regionId = searchParams.get("regionId");
    const city = searchParams.get("city");

    const isValidId = (id: string | null) => id && id !== "undefined" && id !== "null";
    const effectiveOrgId = (orgId === 'all' || !isValidId(orgId)) ? undefined : orgId as any;

    const queryArgs: any = {
      siteId: isValidId(siteId) ? (siteId as any) : undefined,
      regionId: regionId || undefined,
      city: city || undefined,
    };
    if (effectiveOrgId) queryArgs.organizationId = effectiveOrgId;

    const logs = await fetchQuery(api.logs.listPatrolLogs, queryArgs);
    return NextResponse.json(logs, { headers: corsHeaders() });
  } catch (error: any) {
    console.error("[API] Logs Patrol Org error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

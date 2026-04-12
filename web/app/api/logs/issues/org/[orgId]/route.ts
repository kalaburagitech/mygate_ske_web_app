import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { corsHeaders } from "@/lib/cors";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("siteId");
    const regionId = searchParams.get("regionId");
    const city = searchParams.get("city");

    const isValidId = (id: string | null) => id && id !== "undefined" && id !== "null";
    const effectiveOrgId = (orgId === 'all' || !isValidId(orgId)) ? undefined : orgId as any;

    try {
        const queryArgs: any = {
            siteId: isValidId(siteId) ? (siteId as any) : undefined,
            regionId: regionId || undefined,
            city: city || undefined,
        };
        if (effectiveOrgId) queryArgs.organizationId = effectiveOrgId;

        const issues = await fetchQuery(api.logs.listIssuesByOrg, queryArgs);

        return NextResponse.json(issues, { headers: corsHeaders() });
    } catch (error: any) {
        console.error("Fetch issues error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch issues" },
            { status: 500, headers: corsHeaders() }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders() });
}

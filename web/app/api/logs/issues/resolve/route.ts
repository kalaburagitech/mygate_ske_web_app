import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { corsHeaders } from "@/lib/cors";

export async function POST(req: Request) {
    try {
        const { issueId } = await req.json();

        if (!issueId) {
            return NextResponse.json(
                { error: "Issue ID is required" },
                { status: 400, headers: corsHeaders() }
            );
        }

        await fetchMutation(api.logs.resolveIssue, { issueId: issueId as any });

        return NextResponse.json({ success: true }, { headers: corsHeaders() });
    } catch (error: any) {
        console.error("Resolve issue error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to resolve issue" },
            { status: 500, headers: corsHeaders() }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders() });
}

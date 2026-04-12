import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function GET(req: NextRequest) {
  console.log("[API] GET /api/enrollment - Request received");
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const region = searchParams.get("region");
    const empId = searchParams.get("empId");

    const filters: any = {};
    if (organizationId) filters.organizationId = organizationId as any;
    if (region) filters.region = region;
    if (empId) filters.empId = empId;

    const enrollments = await convex.query(api.enrollment.list, filters);
    console.log(`[API] GET /api/enrollment - Success: ${enrollments.length} enrollments found`);
    return NextResponse.json(enrollments);
  } catch (error) {
    console.error("[API] Enrollment list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  console.log("[API] POST /api/enrollment - Request received");
  try {
    const body = await req.json();
    const enrollmentId = await convex.mutation(api.enrollment.create, body);
    console.log(`[API] POST /api/enrollment - Success: Enrollment ${enrollmentId} created`);
    return NextResponse.json({ enrollmentId });
  } catch (error: any) {
    console.error("[API] Create Enrollment error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

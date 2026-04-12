import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const region = searchParams.get("region");
    const date = searchParams.get("date");
    const empId = searchParams.get("empId");
    const siteId = searchParams.get("siteId");
    const shiftName = searchParams.get("shiftName");
    const attendanceId = searchParams.get("attendanceId");
    const approvalStatus = searchParams.get("approvalStatus");
    const requestingUserId = searchParams.get("requestingUserId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (organizationId && startDate && endDate) {
      const records = await convex.query(api.attendance.listForOrgDateRange, {
        organizationId: organizationId as any,
        startDate,
        endDate,
      });
      return NextResponse.json(records);
    }

    const filters: any = {};
    if (organizationId) filters.organizationId = organizationId as any;
    if (region) filters.region = region;
    if (date) filters.date = date;
    if (empId) filters.empId = empId;
    if (siteId) filters.siteId = siteId as any;
    if (shiftName) filters.shiftName = shiftName;
    if (attendanceId) filters.attendanceId = attendanceId as any;
    if (approvalStatus) filters.approvalStatus = approvalStatus;
    if (requestingUserId) filters.requestingUserId = requestingUserId as any;

    const records = await convex.query(api.attendance.list, filters);
    return NextResponse.json(records);
  } catch (error) {
    console.error("[API] Attendance list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const attendanceId = await convex.mutation(api.attendance.create, body);
    return NextResponse.json({ attendanceId });
  } catch (error: any) {
    console.error("[API] Create Attendance error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

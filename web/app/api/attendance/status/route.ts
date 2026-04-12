import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    const { attendanceId, status, approverId } = await req.json();
    if (!attendanceId || !status) {
        return NextResponse.json({ error: "attendanceId and status are required" }, { status: 400 });
    }
    await convex.mutation(api.attendance.updateAttendanceStatus, { attendanceId, status, approverId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API] updateAttendanceStatus error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

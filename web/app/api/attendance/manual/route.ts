import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const attendanceId = await convex.mutation(api.attendance.createManualAttendance, body);
    return NextResponse.json({ attendanceId });
  } catch (error: any) {
    console.error("[API] createManualAttendance error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

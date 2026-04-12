import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const logs = await convex.query(api.logs.getLogsByUser, { userId: userId as Id<"users"> });
    return NextResponse.json(logs);
  } catch (error) {
    console.error("[API] Logs User error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clerkId: string }> }
) {
  try {
    const { clerkId } = await params;
    const user = await convex.query(api.users.getByClerkId, { clerkId });
    return NextResponse.json(user);
  } catch (error) {
    console.error("[API] User Detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const { organizationId } = await params;
    const users = await convex.query(api.users.listByOrg, {
      organizationId: organizationId as Id<"organizations">,
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("[API] Users by org error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

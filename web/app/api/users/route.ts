import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function GET() {
  console.log("[API] GET /api/users - Request received");
  try {
    const users = await convex.query(api.users.listAll);
    console.log(`[API] GET /api/users - Success: ${users.length} users found`);
    return NextResponse.json(users);
  } catch (error) {
    console.error("[API] Users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  console.log("[API] POST /api/users - Request received");
  try {
    const body = await req.json();
    if (body.role != null && (!Array.isArray(body.roles) || body.roles.length === 0)) {
      body.roles = [body.role];
    }
    delete body.role;
    const userId = await convex.mutation(api.users.create, body);
    console.log(`[API] POST /api/users - Success: User ${userId} created`);
    return NextResponse.json({ userId });
  } catch (error) {
    console.error("[API] Create User error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

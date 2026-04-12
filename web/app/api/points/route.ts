import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  console.log("[API] POST /api/points - Request received");
  try {
    const body = await req.json();
    const { siteId, name, qrCode, latitude, longitude, organizationId, imageId } = body;

    if (!siteId || !name || !qrCode || !organizationId) {
      return NextResponse.json(
        {
          error: "Bad request",
          detail: "Required: siteId, name, qrCode, organizationId. Coordinates optional.",
        },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      siteId,
      name,
      qrCode,
      organizationId,
    };
    if (typeof latitude === "number" && Number.isFinite(latitude)) payload.latitude = latitude;
    if (typeof longitude === "number" && Number.isFinite(longitude)) payload.longitude = longitude;
    if (imageId) payload.imageId = imageId;

    const result = await convex.mutation(api.patrolPoints.createPoint, payload as any);
    console.log("[API] POST /api/points - Success:", result);
    return NextResponse.json({ id: result });
  } catch (error: any) {
    console.error("[API] Points Create error:", error);
    const msg =
      typeof error?.message === "string" ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

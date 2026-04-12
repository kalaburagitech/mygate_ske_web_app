import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const siteId = body.siteId as Id<"sites"> | undefined;
    const qrCode = (body.qrCode ?? body.qrCodeId) as string | undefined;
    const latitude =
      typeof body.latitude === "number" ? body.latitude : body.userLat;
    const longitude =
      typeof body.longitude === "number" ? body.longitude : body.userLon;

    if (!siteId || !qrCode || typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        {
          error: "Bad request",
          detail: "Required: siteId, qrCode (or qrCodeId), latitude & longitude (or userLat, userLon).",
        },
        { status: 400 }
      );
    }

    const validation = await convex.mutation(api.logs.validatePatrolPoint, {
      siteId,
      qrCode,
      latitude,
      longitude,
    });

    return NextResponse.json(validation);
  } catch (error) {
    console.error("[API] Logs validate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

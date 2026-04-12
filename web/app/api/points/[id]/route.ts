import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";
import { Id } from "@/convex/_generated/dataModel";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    await convex.mutation(api.patrolPoints.updatePoint, {
      id: id as Id<"patrolPoints">,
      name: body.name,
      latitude: body.latitude,
      longitude: body.longitude,
      qrCode: body.qrCode,
      imageId: body.imageId,
      siteId: body.siteId,
      organizationId: body.organizationId,
      pointRadiusMeters: body.pointRadiusMeters,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[API] Points PUT error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

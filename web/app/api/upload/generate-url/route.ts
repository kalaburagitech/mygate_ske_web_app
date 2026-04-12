import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api.js";

export async function POST(req: NextRequest) {
  try {
    console.log("[API] Generating upload URL via Convex mutation...");

    // Use the existing Convex mutation instead of raw HTTP to Convex cloud
    const uploadUrl = await convex.mutation(api.images.generateUploadUrl, {});

    if (!uploadUrl) {
      console.error("[API] Convex returned an empty upload URL");
      return NextResponse.json({ error: "Empty upload URL from Convex" }, { status: 500 });
    }

    console.log(`[API] Generated upload URL: ${uploadUrl.substring(0, 50)}...`);
    return NextResponse.json({ uploadUrl });
  } catch (error: any) {
    console.error("[API] Upload generation error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storageId: string }> }
) {
  try {
    const { storageId } = await params;
    if (!storageId) {
      return NextResponse.json({ error: "Storage ID is required" }, { status: 400 });
    }

    // Return the URL from Convex. 
    // We use the deployment URL configured in environment variables.
    const baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.VITE_CONVEX_URL;
    const url = `${baseUrl}/api/storage/${storageId}`;
    
    console.log(`[API] Resolved URL for ${storageId}: ${url}`);
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("[API] Upload Resolve URL error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

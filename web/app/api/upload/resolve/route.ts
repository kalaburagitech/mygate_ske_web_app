import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { storageId } = await req.json();
    if (!storageId) {
      return NextResponse.json({ error: "Storage ID is required" }, { status: 400 });
    }

    // Use standard Convex file URL resolution logic if needed, 
    // or just return the storage ID if the client handles it.
    // Usually, we return the URL from Convex.
    const url = `${process.env.VITE_CONVEX_URL}/api/storage/${storageId}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[API] Upload Resolve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

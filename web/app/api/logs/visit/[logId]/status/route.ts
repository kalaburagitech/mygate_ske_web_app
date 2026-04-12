import { NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function POST(
  request: Request,
  { params }: { params: { logId: string } }
) {
  const { logId } = params;
  const { status, imageId } = await request.json();

  if (!status) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  try {
    await fetchMutation(api.logs.updateVisitorStatus, {
      logId: logId as Id<"visitLogs">,
      status: status as any,
      imageId: imageId || undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

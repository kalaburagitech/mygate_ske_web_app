import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const siteId = searchParams.get("siteId");

  if (!organizationId) {
    return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
  }

  try {
    const clients = await fetchQuery(api.users.listClients, {
      organizationId: organizationId as Id<"organizations">,
      siteId: siteId as Id<"sites"> || undefined,
    });
    return NextResponse.json({ data: clients });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { faceNgrokHeaders, getFaceUpstreamBase } from "@/lib/faceUpstream";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const base = getFaceUpstreamBase();
    const q = req.nextUrl.searchParams.toString();
    const url = `${base}/attendance/check${q ? `?${q}` : ""}`;
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                ...faceNgrokHeaders,
            },
        });
        const ct = res.headers.get("content-type") || "";
        const payload = ct.includes("application/json")
            ? await res.json()
            : { raw: await res.text() };
        return NextResponse.json(payload, { status: res.status });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[face/attendance/check] upstream error:", message);
        return NextResponse.json(
            { error: "Face service unreachable", detail: message, upstream: url },
            { status: 502 }
        );
    }
}

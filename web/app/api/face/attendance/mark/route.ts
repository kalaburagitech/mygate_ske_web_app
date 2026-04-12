import { NextRequest, NextResponse } from "next/server";
import { faceNgrokHeaders, getFaceUpstreamBase } from "@/lib/faceUpstream";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    const base = getFaceUpstreamBase();
    const url = `${base}/attendance/mark`;
    try {
        const body = await req.text();
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                accept: "application/json",
                ...faceNgrokHeaders,
            },
            body,
        });
        const ct = res.headers.get("content-type") || "";
        const payload = ct.includes("application/json")
            ? await res.json()
            : { raw: await res.text() };
        return NextResponse.json(payload, { status: res.status });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[face/attendance/mark] upstream error:", message);
        return NextResponse.json(
            { error: "Face service unreachable", detail: message, upstream: url },
            { status: 502 }
        );
    }
}

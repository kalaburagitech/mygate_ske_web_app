import { NextRequest, NextResponse } from "next/server";
import { faceNgrokHeaders, getFaceUpstreamBase } from "@/lib/faceUpstream";

export const runtime = "nodejs";

/** Proxies multipart batch enroll to the face service so the mobile app only calls your Next API (same host as login/regions). */
export async function POST(req: NextRequest) {
    const base = getFaceUpstreamBase();
    const url = `${base}/batch_enroll`;
    const debug = process.env.NODE_ENV === "development" || process.env.FACE_PROXY_DEBUG === "1";
    try {
        const formData = await req.formData();
        if (debug) {
            const keys = [...new Set(formData.keys())];
            const files = formData.getAll("files");
            console.log("[face/batch-enroll] incoming", {
                formKeys: keys,
                filesParts: files.length,
                upstream: url,
            });
        }
        const res = await fetch(url, {
            method: "POST",
            body: formData,
            headers: faceNgrokHeaders,
        });
        if (debug) {
            console.log("[face/batch-enroll] upstream response", { status: res.status, ok: res.ok });
        }
        const ct = res.headers.get("content-type") || "";
        const payload = ct.includes("application/json")
            ? await res.json()
            : { raw: await res.text() };
        if (debug && typeof payload === "object" && payload !== null && "success" in payload) {
            console.log("[face/batch-enroll] payload summary", {
                success: (payload as { success?: unknown }).success,
                success_count: (payload as { success_count?: unknown }).success_count,
            });
        }
        return NextResponse.json(payload, { status: res.status });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[face/batch-enroll] upstream error:", message, { upstream: url });
        return NextResponse.json(
            {
                error: "Face service unreachable",
                detail: message,
                upstream: url,
            },
            { status: 502 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";

export function corsHeaders(origin: string | null = "*") {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, bypass-tunnel-reminder",
        "Access-Control-Max-Age": "86400",
    };
}

export function handleCors(req: NextRequest) {
    const origin = req.headers.get("origin");
    return corsHeaders(origin);
}

export function handleOptions(req: NextRequest) {
    return new NextResponse(null, {
        status: 200,
        headers: handleCors(req),
    });
}
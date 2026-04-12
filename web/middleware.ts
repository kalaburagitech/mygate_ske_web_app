import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { corsHeaders } from "./lib/cors";

export function middleware(req: NextRequest) {
    const origin = req.headers.get("origin");
    console.log(`[Middleware] ${req.method} ${req.nextUrl.pathname} - Origin: ${origin}`);

    // Handle preflight request
    if (req.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204, // 204 is standard for preflight
            headers: corsHeaders(origin),
        });
    }

    const response = NextResponse.next();

    // Attach CORS headers to all responses
    const headers = corsHeaders(origin);
    Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
    });

    return response;
}

// Ensure middleware only runs on API routes
export const config = {
    matcher: "/api/:path*",
};
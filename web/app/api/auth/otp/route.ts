import { NextRequest, NextResponse } from "next/server";
import { otps } from "@/lib/otpStore";
import { handleCors, handleOptions } from "@/lib/cors";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api";
import { normalizeIndianMobileTo10 } from "@/lib/indianMobile";

export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  const headers = handleCors(req);
  console.log("[API] POST /api/auth/otp - Request received");
  try {
    const body = await req.json();
    const { mobileNumber } = body;

    if (mobileNumber === undefined || mobileNumber === null || String(mobileNumber).trim() === "") {
      return NextResponse.json(
        { success: false, error: "Mobile number is required." },
        { status: 200, headers }
      );
    }

    const ten = normalizeIndianMobileTo10(String(mobileNumber));
    if (!ten) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter a valid Indian mobile number: 10 digits after +91, starting with 6, 7, 8, or 9.",
        },
        { status: 200, headers }
      );
    }

    const user = await convex.query(api.users.getByIndianMobile10, { tenDigits: ten });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This mobile number is not registered. Please contact your administrator to get access.",
        },
        { status: 200, headers }
      );
    }

    if (user.status === "inactive") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Your account is inactive. Please contact your administrator.",
        },
        { status: 200, headers }
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(ten, {
      otp,
      expiry: Date.now() + 5 * 60 * 1000,
    });

    console.log(`[AUTH] OTP for +91 ${ten} stored (user: ${user._id})`);
    if (process.env.NODE_ENV === "development") {
      console.log(`[AUTH] DEV ONLY — OTP: ${otp}`);
    }

    const payload: {
      success: true;
      message: string;
      otp?: string;
    } = {
      success: true,
      message: "OTP generated. In production, integrate SMS; for local dev, check server logs.",
    };

    if (process.env.NODE_ENV === "development" || process.env.MOBILE_OTP_DEV === "true") {
      payload.otp = otp;
    }

    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("[API] Send OTP error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again later." },
      { status: 500, headers }
    );
  }
}

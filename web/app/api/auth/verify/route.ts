import { NextRequest, NextResponse } from "next/server";
import { otps } from "@/lib/otpStore";
import { convex } from "@/lib/convexClient";
import { api } from "@/convex/_generated/api";
import { handleCors, handleOptions } from "@/lib/cors";
import { normalizeIndianMobileTo10 } from "@/lib/indianMobile";

// ✅ OPTIONS
export function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function POST(req: NextRequest) {
  const headers = handleCors(req);

  try {
    console.log("[API] POST /api/auth/verify - Request received");
    const { mobileNumber, otp } = await req.json();

    if (!mobileNumber || !otp) {
      return NextResponse.json(
        { success: false, error: "Mobile number and OTP are required." },
        { status: 200, headers }
      );
    }

    const ten = normalizeIndianMobileTo10(String(mobileNumber));
    if (!ten) {
      return NextResponse.json(
        { success: false, error: "Invalid mobile number format." },
        { status: 200, headers }
      );
    }

    const stored = otps.get(ten);

    if (!stored) {
      return NextResponse.json(
        { success: false, error: "OTP not found or already used. Request a new code." },
        { status: 200, headers }
      );
    }

    if (Date.now() > stored.expiry) {
      otps.delete(ten);
      return NextResponse.json(
        { success: false, error: "OTP has expired. Please request a new OTP." },
        { status: 200, headers }
      );
    }

    if (stored.otp !== String(otp).trim()) {
      return NextResponse.json(
        { success: false, error: "Invalid OTP. Please check the code and try again." },
        { status: 200, headers }
      );
    }

    otps.delete(ten);

    const user = await convex.query(api.users.getByIndianMobile10, {
      tenDigits: ten,
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Account not found for this number. Please contact your administrator.",
        },
        { status: 200, headers }
      );
    }

    if (user.status === "inactive") {
      return NextResponse.json(
        {
          success: false,
          error: "Your account is inactive. Please contact your administrator.",
        },
        { status: 200, headers }
      );
    }

    return NextResponse.json(
      { success: true, user },
      { headers }
    );

  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Server error. Please try again later." },
      { status: 500, headers }
    );
  }
}
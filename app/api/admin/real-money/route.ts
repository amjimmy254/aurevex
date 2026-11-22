import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

// AUREVEX — Real Money Administration API
// Protected by server-side administrator authentication.

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    success: true,
    platform: "AUREVEX",
    mode: "real-money",
    status: "configuration-required",
    message:
      "Real-money operations require an approved payment provider and verified server-side configuration.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const adminSecret = process.env.AUREVEX_ADMIN_SECRET;

    if (!adminSecret) {
      return NextResponse.json(
        { success: false, error: "Administrator authentication is not configured." },
        { status: 503 }
      );
    }

    const suppliedSecret = request.headers.get("x-admin-secret");

    if (
      !suppliedSecret ||
      suppliedSecret.length !== adminSecret.length ||
      !timingSafeEqual(
        Buffer.from(suppliedSecret),
        Buffer.from(adminSecret)
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (body.action !== "status") {
      return NextResponse.json(
        {
          success: false,
          error: "Only status checks are enabled until a payment provider is configured.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      platform: "AUREVEX",
      realMoneyEnabled: false,
      providerConfigured: false,
      message: "No real-money transactions are currently enabled.",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request." },
      { status: 400 }
    );
  }
}

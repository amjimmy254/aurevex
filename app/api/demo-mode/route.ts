
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoMode = "FAIR" | "WIN_TEST" | "LOSS_TEST";

async function setup() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS aurevex_demo_settings (
      id INTEGER PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'FAIR',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO aurevex_demo_settings (id, mode)
    VALUES (1, 'FAIR')
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getUser(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return null;

  const result = await db.query(
    "SELECT email FROM app_users WHERE id = $1 LIMIT 1",
    [userId]
  );

  return result.rows[0] || null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 }
      );
    }

    await setup();

    const result = await db.query(
      "SELECT mode, updated_at FROM aurevex_demo_settings WHERE id = 1"
    );

    const adminEmail = (
      process.env.AUREVEX_ADMIN_EMAIL || ""
    ).trim().toLowerCase();

    return NextResponse.json({
      mode: result.rows[0].mode,
      updatedAt: result.rows[0].updated_at,
      isAdmin:
        Boolean(adminEmail) &&
        user.email.toLowerCase() === adminEmail
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Demo mode GET error:", error);
    return NextResponse.json(
      { error: "Could not load demo settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 }
      );
    }

    const adminEmail = (
      process.env.AUREVEX_ADMIN_EMAIL || ""
    ).trim().toLowerCase();

    if (
      !adminEmail ||
      user.email.toLowerCase() !== adminEmail
    ) {
      return NextResponse.json(
        { error: "Administrator access required." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const mode = body.mode as DemoMode;

    if (!["FAIR", "WIN_TEST", "LOSS_TEST"].includes(mode)) {
      return NextResponse.json(
        { error: "Invalid demo mode." },
        { status: 400 }
      );
    }

    await setup();

    await db.query(
      `UPDATE aurevex_demo_settings
       SET mode = $1, updated_at = NOW()
       WHERE id = 1`,
      [mode]
    );

    return NextResponse.json({
      message: "Global demo mode updated.",
      mode
    });
  } catch (error) {
    console.error("Demo mode POST error:", error);
    return NextResponse.json(
      { error: "Could not update demo settings." },
      { status: 500 }
    );
  }
}

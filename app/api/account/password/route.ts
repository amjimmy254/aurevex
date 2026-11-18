
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!token || !secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 }
    );
  }

  let userId: string;
  let sessionVersion: number;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (
      !payload.sub ||
      !Number.isInteger(payload.sessionVersion)
    ) {
      throw new Error("Invalid session");
    }

    userId = payload.sub;
    sessionVersion = payload.sessionVersion as number;
  } catch {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  let body: { currentPassword?: string; newPassword?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword || currentPassword.length > 72) {
    return NextResponse.json(
      { error: "Enter your current password." },
      { status: 400 }
    );
  }

  if (newPassword.length < 10 || newPassword.length > 72) {
    return NextResponse.json(
      { error: "New password must be 10–72 characters." },
      { status: 400 }
    );
  }

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Choose a different password." },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `SELECT password_hash, session_version
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    const user = result.rows[0];

    if (
      !user ||
      Number(user.session_version) !== sessionVersion
    ) {
      return NextResponse.json(
        { error: "Your session is no longer valid. Please sign in again." },
        { status: 401 }
      );
    }

    if (
      !user.password_hash ||
      !(await bcrypt.compare(currentPassword, user.password_hash))
    ) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const update = await db.query(
      `UPDATE app_users
       SET password_hash = $1,
           session_version = session_version + 1
       WHERE id = $2 AND session_version = $3
       RETURNING id`,
      [passwordHash, userId, sessionVersion]
    );

    if (update.rowCount !== 1) {
      return NextResponse.json(
        { error: "Your session changed. Please sign in again." },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      {
        message: "Password updated. Please sign in again on all devices."
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    response.cookies.set("aurevex_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });

    return response;
  } catch (error) {
    console.error("Password update error:", error);

    return NextResponse.json(
      { error: "Could not update your password. Please try again." },
      { status: 500 }
    );
  }
}

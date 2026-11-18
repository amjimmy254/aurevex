
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!token || !secret || secret.length < 32) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  let userId: string;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (!payload.sub) throw new Error("Invalid session");
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword || currentPassword.length > 72) {
    return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
  }

  if (newPassword.length < 10 || newPassword.length > 72) {
    return NextResponse.json({ error: "New password must be 10–72 characters." }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Choose a different password." }, { status: 400 });
  }

  try {
    const result = await db.query(
      "SELECT password_hash FROM app_users WHERE id = $1 LIMIT 1",
      [userId]
    );

    const user = result.rows[0];

    if (!user?.password_hash || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      "UPDATE app_users SET password_hash = $1 WHERE id = $2",
      [passwordHash, userId]
    );

    return NextResponse.json(
      { message: "Password updated successfully." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Password update error:", error);

    return NextResponse.json(
      { error: "Could not update your password. Please try again." },
      { status: 500 }
    );
  }
}

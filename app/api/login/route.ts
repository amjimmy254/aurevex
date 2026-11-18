
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.AUREVEX_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Server authentication is not configured." },
      { status: 500 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password || email.length > 254 || password.length > 72) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `SELECT id, email, display_name, password_hash, session_version
       FROM app_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const token = await new SignJWT({
      email: user.email,
      sessionVersion: Number(user.session_version)
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));

    const response = NextResponse.json({
      message: "Login successful.",
      user: {
        id: user.id,
        name: user.display_name,
        email: user.email
      }
    });

    response.cookies.set("aurevex_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { error: "Unable to log in. Please try again." },
      { status: 500 }
    );
  }
}

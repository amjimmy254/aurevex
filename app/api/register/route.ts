
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

  const client = await db.connect();

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!name || name.length > 80) {
      return NextResponse.json(
        { error: "Enter a valid name." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 10 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be 10–72 characters." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO app_users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email, passwordHash, name]
    );

    const user = result.rows[0];

    await client.query(
      `INSERT INTO demo_wallets (user_id, virtual_balance)
       VALUES ($1, 2000.00)`,
      [user.id]
    );

    await client.query("COMMIT");

    const token = await new SignJWT({
      email: user.email
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(secret));

    const response = NextResponse.json({
      message: "Demo account created successfully.",
      user: {
        id: user.id,
        name: user.display_name,
        email: user.email
      }
    }, { status: 201 });

    response.cookies.set("aurevex_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });

    return response;
  } catch (error: unknown) {
    await client.query("ROLLBACK");

    const message =
      error instanceof Error ? error.message : "";

    if (message.includes("app_users_email_key")) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);

    return NextResponse.json(
      { error: "Could not create your account." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

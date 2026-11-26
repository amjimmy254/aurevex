import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    const response = NextResponse.json(
      { error: "Please sign in again to view your support messages." },
      { status: 401 }
    );
    response.cookies.delete("aurevex_session");
    return response;
  }

  try {
    const result = await db.query(
      `SELECT id, message, status, created_at
       FROM (
         SELECT id, message, status, created_at
         FROM support_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 100
       ) recent_messages
       ORDER BY created_at ASC`,
      [userId]
    );

    return NextResponse.json(
      { messages: result.rows },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Support message history error:", error);
    return NextResponse.json(
      { error: "Could not load your support messages." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    const response = NextResponse.json(
      { error: "Please sign in again before sending a support message." },
      { status: 401 }
    );
    response.cookies.delete("aurevex_session");
    return response;
  }

  let body: { message?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Enter a valid message." },
      { status: 400 }
    );
  }

  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message must be between 1 and 2000 characters." },
      { status: 400 }
    );
  }

  try {
    const result = await db.query(
      `INSERT INTO support_messages (user_id, message)
       SELECT $1, $2
       WHERE (
         SELECT COUNT(*)
         FROM support_messages
         WHERE user_id = $1
           AND created_at > NOW() - INTERVAL '5 minutes'
       ) < 5
       RETURNING id, message, status, created_at`,
      [userId, message]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "Please wait a few minutes before sending another message." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: true, message: result.rows[0] },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Support message submission error:", error);
    return NextResponse.json(
      { error: "Your message could not be sent. Please try again." },
      { status: 500 }
    );
  }
}

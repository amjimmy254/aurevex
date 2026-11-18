
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

export async function getAuthenticatedUserId(
  request: NextRequest
): Promise<string | null> {
  const secret = process.env.AUREVEX_SESSION_SECRET;
  const token = request.cookies.get("aurevex_session")?.value;

  if (!secret || secret.length < 32 || !token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    if (
      !payload.sub ||
      !Number.isInteger(payload.sessionVersion)
    ) {
      return null;
    }

    const result = await db.query(
      `SELECT session_version
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user) return null;

    if (
      Number(user.session_version) !==
      payload.sessionVersion
    ) {
      return null;
    }

    return payload.sub;
  } catch (error) {
    console.error("Session verification error:", error);
    return null;
  }
}

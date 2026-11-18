
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("aurevex_session")?.value;
  const secret = process.env.AUREVEX_SESSION_SECRET;

  if (!token || !secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(
      new URL("/login", request.url)
    );

    response.cookies.delete("aurevex_session");
    return response;
  }
}

export const config = {
  matcher: ["/"]
};

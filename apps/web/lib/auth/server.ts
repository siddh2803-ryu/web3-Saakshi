import { NextRequest, NextResponse } from "next/server";

export interface AuthenticatedUser {
  uid: string;
}

/**
 * Extracts the authenticated user ID from the request.
 * Checks:
 * 1. Authorization: Bearer <token_or_uid>
 * 2. x-user-id or x-user-uid header
 * 3. Cookie: saakshi_user or saakshi_uid
 * Returns null if signed out.
 */
export function getAuthenticatedUser(req: NextRequest): AuthenticatedUser | null {
  if (req.headers.get("x-auth-signed-out") === "true") {
    return null;
  }

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      if (token.startsWith("user:")) return { uid: token.slice(5).trim() };
      if (token.startsWith("token_for_")) return { uid: token.slice(10).trim() };
      return { uid: token };
    }
  }

  // 2. x-user-id / x-user-uid header
  const xUserId = req.headers.get("x-user-id") || req.headers.get("x-user-uid");
  if (xUserId && xUserId.trim()) {
    return { uid: xUserId.trim() };
  }

  // 3. Cookie
  const cookie =
    req.cookies?.get("saakshi_user")?.value ||
    req.cookies?.get("saakshi_uid")?.value;
  if (cookie && cookie.trim()) {
    return { uid: cookie.trim() };
  }

  return null;
}

/**
 * Enforces that the request is authenticated.
 * Returns the user or returns a 401 Unauthorized response.
 */
export function requireAuth(
  req: NextRequest
): { user: AuthenticatedUser } | { response: NextResponse } {
  const user = getAuthenticatedUser(req);
  if (!user || !user.uid) {
    return {
      response: NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }
  return { user };
}

/**
 * Enforces that the authenticated user is the owner of the resource.
 * Returns a 403 Forbidden response if user is not the owner.
 */
export function requireOwner(
  callerUid: string,
  resourceOwnerUid: string | undefined,
  customMessage?: string
): NextResponse | null {
  if (!resourceOwnerUid || callerUid !== resourceOwnerUid) {
    const message =
      customMessage ||
      "Forbidden: You do not have access to this resource";
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  return null;
}

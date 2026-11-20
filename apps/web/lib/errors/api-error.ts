import { NextResponse } from "next/server";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Standard API error responder across all Saakshi route handlers.
 * Enforces uniform format: { error: { code: string, message: string } }
 * Strips internal stack traces and zod validation internals in production.
 */
export function createApiError(
  status: number,
  code: string,
  message: string,
  options?: {
    headers?: Record<string, string>;
    internalDetails?: unknown;
  }
): NextResponse<ApiErrorResponse> {
  const isProd = process.env.NODE_ENV === "production";

  // In production, mask 5xx server errors to avoid leaking internal system details
  let clientMessage = message;
  if (isProd && status >= 500) {
    clientMessage = "An unexpected internal server error occurred. Please try again later.";
  }

  const body: ApiErrorResponse = {
    error: {
      code,
      message: clientMessage,
    },
  };

  return NextResponse.json(body, {
    status,
    headers: options?.headers,
  });
}

/**
 * Helper to handle catch(err) in route handlers uniformly.
 * Masks raw system errors in production.
 */
export function handleRouteError(
  err: unknown,
  fallbackCode: string = "INTERNAL_SERVER_ERROR",
  fallbackMessage: string = "Internal server error"
): NextResponse<ApiErrorResponse> {
  const isProd = process.env.NODE_ENV === "production";
  const rawMessage = err instanceof Error ? err.message : String(err);

  const clientMessage = isProd
    ? "An unexpected internal server error occurred. Please try again later."
    : rawMessage || fallbackMessage;

  return NextResponse.json(
    {
      error: {
        code: fallbackCode,
        message: clientMessage,
      },
    },
    { status: 500 }
  );
}

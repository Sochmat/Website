import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, verifyCustomerSession } from "./customerAuth";

/**
 * Route-handler glue for the customer session cookie. Kept out of customerAuth.ts
 * so that module stays free of `next/server` and remains Edge- and vitest-safe.
 */

/** The authenticated caller's user id, or null. Never trust a body/query `userId`. */
export async function getCustomerUserId(request: NextRequest): Promise<ObjectId | null> {
  const token = request.cookies.get(CUSTOMER_COOKIE)?.value;
  const session = await verifyCustomerSession(token);
  if (!session) return null;
  return new ObjectId(session.userId);
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Sign in to continue" },
    { status: 401 },
  );
}

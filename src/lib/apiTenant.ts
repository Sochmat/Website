import { NextResponse } from "next/server";
import { getTenantId, TenantError } from "./tenant";

export async function resolveTenantId(): Promise<
  { tenantId: string } | { error: NextResponse }
> {
  try {
    return { tenantId: await getTenantId() };
  } catch (e) {
    const status = e instanceof TenantError ? e.status : 500;
    const message =
      e instanceof TenantError ? e.message : "Tenant resolution failed";
    return { error: NextResponse.json({ success: false, message }, { status }) };
  }
}

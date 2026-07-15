import { NextResponse } from "next/server";
import { getShopConfig } from "@/lib/shopConfig";

/**
 * Shop config for the browser print station. Admin-session gated by middleware.
 *  GET /api/admin/print-config -> { success, config }
 */
export async function GET() {
  return NextResponse.json({ success: true, config: getShopConfig() });
}

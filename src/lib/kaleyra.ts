/**
 * Kaleyra OTP (India). Set in .env.local:
 * KALEYRA_API_KEY, KALEYRA_SID (required)
 * KALEYRA_SENDER (default KLRHXA), KALEYRA_PREFIX (default +91), KALEYRA_TEMPLATE_ID (optional, for DLT)
 */
const KALEYRA_API_KEY = process.env.KALEYRA_API_KEY;
const KALEYRA_SID = process.env.KALEYRA_SID;
const KALEYRA_SENDER = process.env.KALEYRA_SENDER || "KLRHXA";
const KALEYRA_TEMPLATE_ID = process.env.KALEYRA_TEMPLATE_ID;
const KALEYRA_PREFIX = process.env.KALEYRA_PREFIX || "+91";

const BASE_URL = "https://api.in.kaleyra.io/v1";

export function isKaleyraConfigured(): boolean {
  return !!(KALEYRA_API_KEY && KALEYRA_SID);
}

export interface SendOTPResult {
  success: boolean;
  error?: string;
}

export async function sendOTPSMS(phone: string, otp: string): Promise<SendOTPResult> {
  if (!KALEYRA_API_KEY || !KALEYRA_SID) {
    return { success: false, error: "Kaleyra not configured" };
  }

  const to = phone.startsWith("+") ? phone : `${KALEYRA_PREFIX}${phone}`;

  const body: Record<string, string> = {
    to,
    type: "OTP",
    sender: KALEYRA_SENDER,
    prefix: KALEYRA_PREFIX,
    body: `Dear Customer, ${otp} is your OTP (One Time Password) for login. Valid for 10 minutes.`,
  };

  if (KALEYRA_TEMPLATE_ID) {
    body.template_id = KALEYRA_TEMPLATE_ID;
  }

  try {
    const res = await fetch(`${BASE_URL}/${KALEYRA_SID}/sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "api-key": KALEYRA_API_KEY,
      },
      body: new URLSearchParams(body).toString(),
    });

    const data = (await res.json()) as { error?: Record<string, string>; code?: string; message?: string };
    if (!res.ok) {
      const msg = data.message || (data.error && typeof data.error === "object" ? Object.values(data.error).join(", ") : "Unknown error");
      return { success: false, error: msg };
    }
    if (data.error && Object.keys(data.error).length > 0) {
      return { success: false, error: Object.values(data.error).join(", ") };
    }
    return { success: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Network error";
    return { success: false, error: err };
  }
}

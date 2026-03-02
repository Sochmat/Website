import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "no-reply@sochmat.com";
const SMTP_AUTH_METHOD = (process.env.SMTP_AUTH_METHOD || "password").toLowerCase();

const SMTP_OAUTH_ACCESS_TOKEN = process.env.SMTP_OAUTH_ACCESS_TOKEN;
const SMTP_OAUTH_CLIENT_ID = process.env.SMTP_OAUTH_CLIENT_ID;
const SMTP_OAUTH_CLIENT_SECRET = process.env.SMTP_OAUTH_CLIENT_SECRET;
const SMTP_OAUTH_SCOPE = process.env.SMTP_OAUTH_SCOPE || "https://mail.google.com/";
const SMTP_OAUTH_TOKEN_URL =
  process.env.SMTP_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

let transporter: nodemailer.Transporter | null = null;
let oauthTokenCache: { token: string; expiresAt: number } | null = null;

async function getOAuthAccessToken() {
  if (SMTP_OAUTH_ACCESS_TOKEN) return SMTP_OAUTH_ACCESS_TOKEN;
  if (!SMTP_OAUTH_TOKEN_URL || !SMTP_OAUTH_CLIENT_ID || !SMTP_OAUTH_CLIENT_SECRET) return null;

  const now = Date.now();
  if (oauthTokenCache && oauthTokenCache.expiresAt - 60_000 > now) {
    return oauthTokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SMTP_OAUTH_CLIENT_ID,
    client_secret: SMTP_OAUTH_CLIENT_SECRET,
    scope: SMTP_OAUTH_SCOPE,
  });

  const res = await fetch(SMTP_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    console.error("Failed to fetch SMTP OAuth token");
    return null;
  }

  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) return null;

  oauthTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };

  return data.access_token;
}

async function getTransporter() {
  if (SMTP_AUTH_METHOD === "oauth2") {
    if (!SMTP_HOST || !SMTP_USER) return null;
    const accessToken = await getOAuthAccessToken();
    if (!accessToken) return null;

    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      requireTLS: !SMTP_SECURE,
      auth: {
        type: "OAuth2",
        user: SMTP_USER,
        accessToken,
      },
    });
  }

  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: !SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

export function isEmailConfigured() {
  if (SMTP_AUTH_METHOD === "oauth2") {
    return Boolean(SMTP_HOST && SMTP_USER && (SMTP_OAUTH_ACCESS_TOKEN || SMTP_OAUTH_CLIENT_ID));
  }
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

export async function sendOTPEmail(email: string, otp: string) {
  const tx = await getTransporter();
  if (!tx) {
    console.log(`Email OTP for ${email}: ${otp}`);
    return { success: true };
  }

  try {
    await tx.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: "Your Sochmat OTP",
      text: `Your OTP is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    return { success: false, error: "Failed to send OTP email" };
  }
}

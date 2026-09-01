import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ADMIN_COOKIE_NAME = "trip_strategy_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(secret: string) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `admin:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `${payload}:${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const adminPasscode = getRequiredEnv("TRIP_ADMIN_PASSCODE");
    const sessionSecret = getRequiredEnv("TRIP_ADMIN_SESSION_SECRET");

    const body = (await request.json()) as {
      passcode?: unknown;
    };

    const passcode =
      typeof body.passcode === "string" ? body.passcode.trim() : "";

    if (!passcode || !safeEqual(passcode, adminPasscode)) {
      return NextResponse.json(
        {
          success: false,
          message: "Incorrect admin passcode.",
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Admin access verified.",
    });

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: createSessionToken(sessionSecret),
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Admin verification error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to verify admin access.",
      },
      { status: 500 },
    );
  }
}

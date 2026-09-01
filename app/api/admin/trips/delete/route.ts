import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_COOKIE_NAME = "trip_strategy_admin";

type DeleteTripRequest = {
  tripId?: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function verifyAdminSession(token: string | undefined, secret: string) {
  if (!token) {
    return false;
  }

  const parts = token.split(":");

  if (parts.length !== 3 || parts[0] !== "admin") {
    return false;
  }

  const expiresAt = Number(parts[1]);
  const signature = parts[2];

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const payload = `admin:${expiresAt}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: NextRequest) {
  try {
    const sessionSecret = getRequiredEnv("TRIP_ADMIN_SESSION_SECRET");
    const adminSession = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

    if (!verifyAdminSession(adminSession, sessionSecret)) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin authorization is required.",
        },
        { status: 401 },
      );
    }

    const body = (await request.json()) as DeleteTripRequest;
    const tripId = stringValue(body.tripId);

    if (!tripId || !isUuid(tripId)) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid saved trip ID is required.",
        },
        { status: 400 },
      );
    }

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseSecretKey = getRequiredEnv("SUPABASE_SECRET_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: trip, error: tripError } = await supabaseAdmin
      .from("trip_profiles")
      .select("id, name, subtitle, is_active")
      .eq("id", tripId)
      .maybeSingle();

    if (tripError) {
      throw tripError;
    }

    if (!trip) {
      return NextResponse.json(
        {
          success: false,
          message: "That trip could not be found.",
        },
        { status: 404 },
      );
    }

    if (trip.is_active) {
      return NextResponse.json(
        {
          success: false,
          message:
            "The published active trip cannot be deleted. Publish another trip first.",
        },
        { status: 409 },
      );
    }

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("competition_tracks")
      .select("id")
      .eq("trip_profile_id", tripId);

    if (tracksError) {
      throw tracksError;
    }

    const trackIds = (tracks ?? []).map((track) => track.id);

    if (trackIds.length > 0) {
      const { error: categoriesDeleteError } = await supabaseAdmin
        .from("competition_categories")
        .delete()
        .in("competition_track_id", trackIds);

      if (categoriesDeleteError) {
        throw categoriesDeleteError;
      }

      const { error: tracksDeleteError } = await supabaseAdmin
        .from("competition_tracks")
        .delete()
        .eq("trip_profile_id", tripId);

      if (tracksDeleteError) {
        throw tracksDeleteError;
      }
    }

    const { error: tripDeleteError } = await supabaseAdmin
      .from("trip_profiles")
      .delete()
      .eq("id", tripId);

    if (tripDeleteError) {
      throw tripDeleteError;
    }

    return NextResponse.json({
      success: true,
      message: `${trip.name}${trip.subtitle ? ` — ${trip.subtitle}` : ""} was deleted.`,
      tripId,
    });
  } catch (error) {
    console.error("Admin trip delete error:", error);

    const message =
      error instanceof Error ? error.message : "Unable to delete trip.";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 },
    );
  }
}

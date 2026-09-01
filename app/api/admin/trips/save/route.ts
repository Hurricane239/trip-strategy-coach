import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_COOKIE_NAME = "trip_strategy_admin";

type CategoryInput = {
  label?: unknown;
  winningSlots?: unknown;
  slotsLabel?: unknown;
};

type SaveTripRequest = {
  trip?: {
    id?: unknown;
    name?: unknown;
    subtitle?: unknown;
    originalQualificationLabel?: unknown;
    extraQualificationLabel?: unknown;
    originalCashFlowBelowRvp?: unknown;
    originalCashFlowRvp?: unknown;
  };
  originalCategories?: Record<string, CategoryInput>;
  extraCategories?: Record<string, CategoryInput>;
  bppRules?: Record<string, unknown>;
  setActive?: unknown;
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

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function buildCategoryRows(
  trackId: string,
  categories: Record<string, CategoryInput>,
  extra = false,
) {
  return Object.entries(categories).map(([categoryKey, category], index) => {
    const winningSlots = Math.round(numberValue(category.winningSlots));

    return {
      competition_track_id: trackId,
      category_key: categoryKey,
      label: stringValue(category.label, categoryKey),
      winning_slots: winningSlots,
      slots_label:
        stringValue(category.slotsLabel) ||
        `${winningSlots}${extra ? " Extra U.S. Slots" : " U.S. Slots"}`,
      display_order: index + 1,
      is_enabled: true,
      updated_at: new Date().toISOString(),
    };
  });
}

function buildBppRows(bppRules: Record<string, unknown>) {
  const map: Array<{
    key: string;
    label: string;
    unit: string;
    displayOrder: number;
  }> = [
    { key: "recruit", label: "Recruit", unit: "bpp_each", displayOrder: 1 },
    {
      key: "premium_multiplier",
      label: "Life Premium",
      unit: "bpp_per_dollar",
      displayOrder: 2,
    },
    {
      key: "initial_trade",
      label: "Initial Securities Trade",
      unit: "bpp_each",
      displayOrder: 3,
    },
    {
      key: "securities_production_percent",
      label: "Securities Production",
      unit: "percent",
      displayOrder: 4,
    },
    {
      key: "mortgage_production_percent",
      label: "Mortgage Production",
      unit: "percent",
      displayOrder: 5,
    },
    {
      key: "life_license",
      label: "Life License",
      unit: "bpp_each",
      displayOrder: 6,
    },
    {
      key: "securities_license",
      label: "Securities License / Exam",
      unit: "bpp_each",
      displayOrder: 7,
    },
    {
      key: "mortgage_license",
      label: "Mortgage License",
      unit: "bpp_each",
      displayOrder: 8,
    },
    {
      key: "qualify",
      label: "Qualify",
      unit: "bpp_each",
      displayOrder: 9,
    },
    {
      key: "play_up",
      label: "Play Up",
      unit: "bpp_each",
      displayOrder: 10,
    },
  ];

  return map.map((item) => ({
    rule_key: item.key,
    label: item.label,
    value: numberValue(bppRules[item.key]),
    unit: item.unit,
    display_order: item.displayOrder,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
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

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseSecretKey = getRequiredEnv("SUPABASE_SECRET_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const body = (await request.json()) as SaveTripRequest;
    const trip = body.trip;

    if (!trip) {
      return NextResponse.json(
        {
          success: false,
          message: "Trip configuration is required.",
        },
        { status: 400 },
      );
    }

    const name = stringValue(trip.name);
    const subtitle = stringValue(trip.subtitle);
    const originalQualificationLabel = stringValue(
      trip.originalQualificationLabel,
    );
    const extraQualificationLabel = stringValue(
      trip.extraQualificationLabel,
    );

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          message: "Trip name is required.",
        },
        { status: 400 },
      );
    }

    const requestedId = stringValue(trip.id);
    const setActive = body.setActive === true;
    const now = new Date().toISOString();

    if (setActive) {
      const { error: deactivateError } = await supabaseAdmin
        .from("trip_profiles")
        .update({
          is_active: false,
          updated_at: now,
        })
        .eq("is_active", true);

      if (deactivateError) {
        throw deactivateError;
      }
    }

    let tripId = requestedId;

    const tripPayload = {
      name,
      subtitle,
      is_active: setActive,
      original_qualification_label: originalQualificationLabel,
      extra_qualification_label: extraQualificationLabel,
      original_cash_flow_below_rvp: numberValue(
        trip.originalCashFlowBelowRvp,
      ),
      original_cash_flow_rvp: numberValue(trip.originalCashFlowRvp),
      updated_at: now,
    };

    if (requestedId && isUuid(requestedId)) {
      const { data: updatedTrip, error: updateTripError } = await supabaseAdmin
        .from("trip_profiles")
        .update(tripPayload)
        .eq("id", requestedId)
        .select("id")
        .maybeSingle();

      if (updateTripError) {
        throw updateTripError;
      }

      if (updatedTrip) {
        tripId = updatedTrip.id;
      } else {
        const { data: insertedTrip, error: insertTripError } =
          await supabaseAdmin
            .from("trip_profiles")
            .insert({
              ...tripPayload,
              id: requestedId,
            })
            .select("id")
            .single();

        if (insertTripError) {
          throw insertTripError;
        }

        tripId = insertedTrip.id;
      }
    } else {
      const { data: insertedTrip, error: insertTripError } =
        await supabaseAdmin
          .from("trip_profiles")
          .insert(tripPayload)
          .select("id")
          .single();

      if (insertTripError) {
        throw insertTripError;
      }

      tripId = insertedTrip.id;
    }

    const trackPayloads = [
      {
        trip_profile_id: tripId,
        track_key: "original",
        label: "Original Competition",
        qualification_label: originalQualificationLabel,
        display_order: 1,
        is_enabled: true,
        updated_at: now,
      },
      {
        trip_profile_id: tripId,
        track_key: "extra_slots",
        label: "Extra Slots Competition",
        qualification_label: extraQualificationLabel,
        display_order: 2,
        is_enabled: true,
        updated_at: now,
      },
    ];

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("competition_tracks")
      .upsert(trackPayloads, {
        onConflict: "trip_profile_id,track_key",
      })
      .select("id, track_key");

    if (tracksError || !tracks) {
      throw tracksError || new Error("Unable to save competition tracks.");
    }

    const originalTrack = tracks.find(
      (track) => track.track_key === "original",
    );
    const extraTrack = tracks.find(
      (track) => track.track_key === "extra_slots",
    );

    if (!originalTrack || !extraTrack) {
      throw new Error("Saved competition tracks could not be resolved.");
    }

    if (body.originalCategories) {
      const rows = buildCategoryRows(
        originalTrack.id,
        body.originalCategories,
        false,
      );

      const { error: categoriesError } = await supabaseAdmin
        .from("competition_categories")
        .upsert(rows, {
          onConflict: "competition_track_id,category_key",
        });

      if (categoriesError) {
        throw categoriesError;
      }
    }

    if (body.extraCategories) {
      const rows = buildCategoryRows(
        extraTrack.id,
        body.extraCategories,
        true,
      );

      const { error: extraCategoriesError } = await supabaseAdmin
        .from("competition_categories")
        .upsert(rows, {
          onConflict: "competition_track_id,category_key",
        });

      if (extraCategoriesError) {
        throw extraCategoriesError;
      }
    }

    if (body.bppRules) {
      const { error: bppError } = await supabaseAdmin
        .from("bpp_rules")
        .upsert(buildBppRows(body.bppRules), {
          onConflict: "rule_key",
        });

      if (bppError) {
        throw bppError;
      }
    }

    return NextResponse.json({
      success: true,
      message: setActive
        ? "Trip saved and published as the active trip."
        : "Trip saved to Supabase.",
      tripId,
      isActive: setActive,
    });
  } catch (error) {
    console.error("Admin trip save error:", error);

    const message =
      error instanceof Error ? error.message : "Unable to save trip.";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 },
    );
  }
}

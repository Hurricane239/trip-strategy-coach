"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "../lib/supabase";

type Strategy = {
  recruits: number;
  premium: number;
  initialTrades: number;
  securitiesProduction: number;
  mortgageProduction: number;
  lifeLicenses: number;
  securitiesLicenses: number;
  mortgageLicenses: number;
  qualifies: number;
  playUps: number;
};

type BppRules = {
  recruit: number;
  premiumMultiplier: number;
  initialTrade: number;
  securitiesProductionPercent: number;
  mortgageProductionPercent: number;
  lifeLicense: number;
  securitiesLicense: number;
  mortgageLicense: number;
  qualify: number;
  playUp: number;
};

const DEFAULT_BPP_RULES: BppRules = {
  recruit: 1000,
  premiumMultiplier: 1,
  initialTrade: 1000,
  securitiesProductionPercent: 10,
  mortgageProductionPercent: 10,
  lifeLicense: 30000,
  securitiesLicense: 30000,
  mortgageLicense: 30000,
  qualify: 75000,
  playUp: 75000,
};

type LeadershipLevel =
  | "rep"
  | "senior_rep"
  | "district_leader"
  | "division_leader"
  | "regional_leader"
  | "rvp";

type LevelRule = {
  label: string;
  qualifyRecruits: number;
  qualifyPremium: number;
  playUpRecruits: number | null;
  playUpPremium: number | null;
};

const LEVEL_RULES: Record<LeadershipLevel, LevelRule> = {
  rep: {
    label: "Rep",
    qualifyRecruits: 1,
    qualifyPremium: 1000,
    playUpRecruits: 1,
    playUpPremium: 1000,
  },
  senior_rep: {
    label: "Senior Rep",
    qualifyRecruits: 1,
    qualifyPremium: 1000,
    playUpRecruits: 3,
    playUpPremium: 2500,
  },
  district_leader: {
    label: "District Leader",
    qualifyRecruits: 3,
    qualifyPremium: 2500,
    playUpRecruits: 5,
    playUpPremium: 5000,
  },
  division_leader: {
    label: "Division Leader",
    qualifyRecruits: 5,
    qualifyPremium: 5000,
    playUpRecruits: 7,
    playUpPremium: 7500,
  },
  regional_leader: {
    label: "Regional Leader",
    qualifyRecruits: 7,
    qualifyPremium: 7500,
    playUpRecruits: 10,
    playUpPremium: 10000,
  },
  rvp: {
    label: "RVP",
    qualifyRecruits: 10,
    qualifyPremium: 10000,
    playUpRecruits: null,
    playUpPremium: null,
  },
};

type CompetitionTrack = "original" | "extra_slots";

type OriginalCompetitionCategory =
  | "rvp_above_at_1st"
  | "rvp_above"
  | "cash_flow"
  | "new_rvp"
  | "us_future_rvp"
  | "us_future_regional_leader"
  | "us_life_licensed_after_june_5";

type ExtraCompetitionCategory =
  | "rvp_above"
  | "us_future_rvp"
  | "us_future_regional_leader"
  | "us_newly_life_licensed";

type CompetitionCategory =
  | OriginalCompetitionCategory
  | ExtraCompetitionCategory;

type CompetitionCategoryRule = {
  label: string;
  winningSlots: number;
  slotsLabel: string;
};

const ORIGINAL_CATEGORIES: Record<
  OriginalCompetitionCategory,
  CompetitionCategoryRule
> = {
  rvp_above_at_1st: {
    label: "RVP & Above at 1st",
    winningSlots: 55,
    slotsLabel: "55 Slots",
  },
  rvp_above: {
    label: "RVP & Above",
    winningSlots: 620,
    slotsLabel: "620 Slots",
  },
  cash_flow: {
    label: "Cash Flow",
    winningSlots: 60,
    slotsLabel: "60 Slots",
  },
  new_rvp: {
    label: "New RVP",
    winningSlots: 30,
    slotsLabel: "30 Slots",
  },
  us_future_rvp: {
    label: "U.S. Future RVP (Regional Leader)",
    winningSlots: 135,
    slotsLabel: "135 U.S. Slots",
  },
  us_future_regional_leader: {
    label: "U.S. Future Regional Leader",
    winningSlots: 115,
    slotsLabel: "115 U.S. Slots",
  },
  us_life_licensed_after_june_5: {
    label: "U.S. Life Licensed After June 5, 2026",
    winningSlots: 10,
    slotsLabel: "10 U.S. Winners",
  },
};

const EXTRA_SLOT_CATEGORIES: Record<
  ExtraCompetitionCategory,
  CompetitionCategoryRule
> = {
  rvp_above: {
    label: "RVP & Above",
    winningSlots: 275,
    slotsLabel: "275 Extra Slots",
  },
  us_future_rvp: {
    label: "U.S. Future RVP (Regional Leader)",
    winningSlots: 100,
    slotsLabel: "100 Extra U.S. Slots",
  },
  us_future_regional_leader: {
    label: "U.S. Future Regional Leader",
    winningSlots: 90,
    slotsLabel: "90 Extra U.S. Slots",
  },
  us_newly_life_licensed: {
    label: "U.S. Life Licensed Aug 3–Nov 2026",
    winningSlots: 5,
    slotsLabel: "5 U.S. Winners",
  },
};

const COMPETITION_TRACKS = {
  original: {
    label: "Original Competition",
    qualificationLabel: "May–Nov 2026",
  },
  extra_slots: {
    label: "Extra Slots Competition",
    qualificationLabel: "Aug–Nov 2026",
  },
} satisfies Record<
  CompetitionTrack,
  {
    label: string;
    qualificationLabel: string;
  }
>;

function getDefaultCompetitionCategory(
  leadershipLevel: LeadershipLevel,
  competitionTrack: CompetitionTrack,
): CompetitionCategory {
  // RVPs compete in the RVP & Above category.
  if (leadershipLevel === "rvp") {
    return "rvp_above";
  }

  // Regional Leaders are Future RVPs in both competition tracks.
  if (leadershipLevel === "regional_leader") {
    return "us_future_rvp";
  }

  // Reps through Division Leaders are Future Regional Leaders.
  // "U.S. Newly Life Licensed" remains a manual override because
  // leadership level alone does not tell us whether someone is newly licensed.
  if (competitionTrack === "extra_slots") {
    return "us_future_regional_leader";
  }

  return "us_future_regional_leader";
}

type SavedTripProfile = {
  id: string;
  tripName: string;
  tripSubtitle: string;
  originalQualificationLabel: string;
  extraQualificationLabel: string;
  originalCashFlowBelowRvp: number;
  originalCashFlowRvp: number;
  originalCategoryRules: Record<
    OriginalCompetitionCategory,
    CompetitionCategoryRule
  >;
  extraCategoryRules: Record<
    ExtraCompetitionCategory,
    CompetitionCategoryRule
  >;
};

const TRIP_STORAGE_KEY = "trip-strategy-coach:saved-trips:v1";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
  blankWhenZero = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  placeholder?: string;
  blankWhenZero?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min="0"
        placeholder={placeholder}
        value={blankWhenZero && value === 0 ? "" : value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
      />
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Status({ ok, okLabel = "On Target", badLabel = "Needs Attention" }: { ok: boolean; okLabel?: string; badLabel?: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      {ok ? okLabel : badLabel}
    </span>
  );
}

export default function Home() {
  const [currentBpp, setCurrentBpp] = useState(0);
  const [rank, setRank] = useState(0);
  const [winningLine, setWinningLine] = useState(0);
  const [safetyMargin, setSafetyMargin] = useState(100000);
  const [coachName, setCoachName] = useState("");
  const [competitionCashFlow, setCompetitionCashFlow] = useState(0);
  const [competitionPremium, setCompetitionPremium] = useState(0);
  const [extraCashFlowMinimum, setExtraCashFlowMinimum] = useState(0);
  const [strategyMode, setStrategyMode] = useState<"recommended" | "coach">("recommended");
  const [strategyName, setStrategyName] = useState("Coach's Custom Strategy");
  const [coachNotes, setCoachNotes] = useState("");
  const [visibleStrategyFields, setVisibleStrategyFields] = useState<
    Array<keyof Strategy>
  >([]);
  const [showTripSetup, setShowTripSetup] = useState(false);

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminSaveLoading, setAdminSaveLoading] = useState(false);
  const [adminDeleteLoading, setAdminDeleteLoading] = useState(false);
  const [adminSaveMessage, setAdminSaveMessage] = useState("");
  const [adminSaveError, setAdminSaveError] = useState("");
  const [bppRules, setBppRules] = useState<BppRules>(DEFAULT_BPP_RULES);

  const [tripName, setTripName] = useState("Escape to Paradise");
  const [tripSubtitle, setTripSubtitle] = useState("Baha Mar 2027");
  const [originalQualificationLabel, setOriginalQualificationLabel] =
    useState("May–Nov 2026");
  const [extraQualificationLabel, setExtraQualificationLabel] =
    useState("Aug–Nov 2026");
  const [originalCashFlowBelowRvp, setOriginalCashFlowBelowRvp] =
    useState(10500);
  const [originalCashFlowRvp, setOriginalCashFlowRvp] = useState(28000);
  const [originalCategoryRules, setOriginalCategoryRules] =
    useState(ORIGINAL_CATEGORIES);
  const [extraCategoryRules, setExtraCategoryRules] =
    useState(EXTRA_SLOT_CATEGORIES);
  const [savedTrips, setSavedTrips] = useState<SavedTripProfile[]>([]);
  const [activeTripId, setActiveTripId] = useState("baha-mar-2027");
  const [publishedTrip, setPublishedTrip] =
    useState<SavedTripProfile | null>(null);
  const [tripSaveMessage, setTripSaveMessage] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState<
    "loading" | "connected" | "error"
  >("loading");
  const [databaseMessage, setDatabaseMessage] = useState(
    "Loading active trip from Supabase...",
  );
  const [leadershipLevel, setLeadershipLevel] =
    useState<LeadershipLevel>("regional_leader");
  const [competitionTrack, setCompetitionTrack] =
    useState<CompetitionTrack>("original");
  const [competitionCategory, setCompetitionCategory] =
    useState<CompetitionCategory>("us_future_rvp");
  const [monthlyRecruits, setMonthlyRecruits] = useState(0);
  const [directRecruits, setDirectRecruits] = useState(0);
  const [monthlyPremium, setMonthlyPremium] = useState(0);
  const [personalPremium, setPersonalPremium] = useState(0);

  const [strategy, setStrategy] = useState<Strategy>({
    recruits: 0,
    premium: 0,
    initialTrades: 0,
    securitiesProduction: 0,
    mortgageProduction: 0,
    lifeLicenses: 0,
    securitiesLicenses: 0,
    mortgageLicenses: 0,
    qualifies: 0,
    playUps: 0,
  });

  function toggleStrategyField(field: keyof Strategy) {
    setVisibleStrategyFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  function cloneOriginalRules(
    rules: Record<OriginalCompetitionCategory, CompetitionCategoryRule>,
  ) {
    return Object.fromEntries(
      Object.entries(rules).map(([key, value]) => [key, { ...value }]),
    ) as Record<OriginalCompetitionCategory, CompetitionCategoryRule>;
  }

  function cloneExtraRules(
    rules: Record<ExtraCompetitionCategory, CompetitionCategoryRule>,
  ) {
    return Object.fromEntries(
      Object.entries(rules).map(([key, value]) => [key, { ...value }]),
    ) as Record<ExtraCompetitionCategory, CompetitionCategoryRule>;
  }

  function currentTripProfile(id = activeTripId): SavedTripProfile {
    return {
      id,
      tripName,
      tripSubtitle,
      originalQualificationLabel,
      extraQualificationLabel,
      originalCashFlowBelowRvp,
      originalCashFlowRvp,
      originalCategoryRules: cloneOriginalRules(originalCategoryRules),
      extraCategoryRules: cloneExtraRules(extraCategoryRules),
    };
  }

  function applyTripProfile(profile: SavedTripProfile) {
    setActiveTripId(profile.id);
    setTripName(profile.tripName);
    setTripSubtitle(profile.tripSubtitle);
    setOriginalQualificationLabel(profile.originalQualificationLabel);
    setExtraQualificationLabel(profile.extraQualificationLabel);
    setOriginalCashFlowBelowRvp(profile.originalCashFlowBelowRvp);
    setOriginalCashFlowRvp(profile.originalCashFlowRvp);
    setOriginalCategoryRules(cloneOriginalRules(profile.originalCategoryRules));
    setExtraCategoryRules(cloneExtraRules(profile.extraCategoryRules));
    setCompetitionTrack("original");
    setCompetitionCategory(
      getDefaultCompetitionCategory(leadershipLevel, "original"),
    );
    setTripSaveMessage("");
  }

  function persistTrips(nextTrips: SavedTripProfile[]) {
    setSavedTrips(nextTrips);
    window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(nextTrips));
  }

  function saveCurrentTrip() {
    const profile = currentTripProfile();
    const exists = savedTrips.some((trip) => trip.id === activeTripId);
    const nextTrips = exists
      ? savedTrips.map((trip) => (trip.id === activeTripId ? profile : trip))
      : [...savedTrips, profile];

    persistTrips(nextTrips);
    setTripSaveMessage("Trip saved.");
  }

  function createNewTrip() {
    const id = `trip-${Date.now()}`;
    const blankOriginal = cloneOriginalRules(ORIGINAL_CATEGORIES);
    const blankExtra = cloneExtraRules(EXTRA_SLOT_CATEGORIES);

    const newProfile: SavedTripProfile = {
      id,
      tripName: "New Trip",
      tripSubtitle: "Destination / Year",
      originalQualificationLabel: "Qualification Period",
      extraQualificationLabel: "Extra Slots Period",
      originalCashFlowBelowRvp: 0,
      originalCashFlowRvp: 0,
      originalCategoryRules: blankOriginal,
      extraCategoryRules: blankExtra,
    };

    const nextTrips = [...savedTrips, newProfile];
    persistTrips(nextTrips);
    applyTripProfile(newProfile);
    setShowTripSetup(true);
    setTripSaveMessage("New trip created. Update the rules, then save.");
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSupabaseConfiguration() {
      setDatabaseStatus("loading");
      setDatabaseMessage("Loading active trip from Supabase...");

      const { data: trip, error: tripError } = await supabase
        .from("trip_profiles")
        .select(
          "id, name, subtitle, original_qualification_label, extra_qualification_label, original_cash_flow_below_rvp, original_cash_flow_rvp",
        )
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (tripError || !trip) {
        if (!cancelled) {
          setDatabaseStatus("error");
          setDatabaseMessage(
            tripError?.message ||
              "No active trip was found in Supabase. Using built-in defaults.",
          );
        }
        return;
      }

      const { data: tracks, error: tracksError } = await supabase
        .from("competition_tracks")
        .select(
          "id, track_key, label, qualification_label, display_order, is_enabled",
        )
        .eq("trip_profile_id", trip.id)
        .eq("is_enabled", true)
        .order("display_order");

      if (tracksError || !tracks) {
        if (!cancelled) {
          setDatabaseStatus("error");
          setDatabaseMessage(
            tracksError?.message ||
              "The active trip loaded, but its competition tracks did not.",
          );
        }
        return;
      }

      const originalTrack = tracks.find(
        (track) => track.track_key === "original",
      );
      const extraTrack = tracks.find(
        (track) => track.track_key === "extra_slots",
      );

      const trackIds = tracks.map((track) => track.id);

      const { data: categories, error: categoriesError } =
        trackIds.length > 0
          ? await supabase
              .from("competition_categories")
              .select(
                "competition_track_id, category_key, label, winning_slots, slots_label, display_order, is_enabled",
              )
              .in("competition_track_id", trackIds)
              .eq("is_enabled", true)
              .order("display_order")
          : { data: [], error: null };

      if (categoriesError || !categories) {
        if (!cancelled) {
          setDatabaseStatus("error");
          setDatabaseMessage(
            categoriesError?.message ||
              "The competition tracks loaded, but their categories did not.",
          );
        }
        return;
      }

      const { data: bppRows, error: bppError } = await supabase
        .from("bpp_rules")
        .select("rule_key, value")
        .eq("is_active", true)
        .order("display_order");

      if (bppError || !bppRows) {
        if (!cancelled) {
          setDatabaseStatus("error");
          setDatabaseMessage(
            bppError?.message ||
              "The trip loaded, but the global BPP rules did not.",
          );
        }
        return;
      }

      const nextOriginalRules = cloneOriginalRules(ORIGINAL_CATEGORIES);
      const nextExtraRules = cloneExtraRules(EXTRA_SLOT_CATEGORIES);

      if (originalTrack) {
        categories
          .filter(
            (category) =>
              category.competition_track_id === originalTrack.id,
          )
          .forEach((category) => {
            const key =
              category.category_key as OriginalCompetitionCategory;

            if (key in nextOriginalRules) {
              nextOriginalRules[key] = {
                label: category.label,
                winningSlots: Number(category.winning_slots) || 0,
                slotsLabel:
                  category.slots_label ||
                  `${whole.format(Number(category.winning_slots) || 0)} U.S. Slots`,
              };
            }
          });
      }

      if (extraTrack) {
        categories
          .filter(
            (category) =>
              category.competition_track_id === extraTrack.id,
          )
          .forEach((category) => {
            const key =
              category.category_key as ExtraCompetitionCategory;

            if (key in nextExtraRules) {
              nextExtraRules[key] = {
                label: category.label,
                winningSlots: Number(category.winning_slots) || 0,
                slotsLabel:
                  category.slots_label ||
                  `${whole.format(Number(category.winning_slots) || 0)} Extra U.S. Slots`,
              };
            }
          });
      }

      const nextBppRules: BppRules = { ...DEFAULT_BPP_RULES };

      bppRows.forEach((row) => {
        const value = Number(row.value) || 0;

        switch (row.rule_key) {
          case "recruit":
            nextBppRules.recruit = value;
            break;
          case "premium_multiplier":
            nextBppRules.premiumMultiplier = value;
            break;
          case "initial_trade":
            nextBppRules.initialTrade = value;
            break;
          case "securities_production_percent":
            nextBppRules.securitiesProductionPercent = value;
            break;
          case "mortgage_production_percent":
            nextBppRules.mortgageProductionPercent = value;
            break;
          case "life_license":
            nextBppRules.lifeLicense = value;
            break;
          case "securities_license":
            nextBppRules.securitiesLicense = value;
            break;
          case "mortgage_license":
            nextBppRules.mortgageLicense = value;
            break;
          case "qualify":
            nextBppRules.qualify = value;
            break;
          case "play_up":
            nextBppRules.playUp = value;
            break;
        }
      });

      if (cancelled) {
        return;
      }

      const loadedProfile: SavedTripProfile = {
        id: trip.id,
        tripName: trip.name,
        tripSubtitle: trip.subtitle || "",
        originalQualificationLabel:
          originalTrack?.qualification_label ||
          trip.original_qualification_label ||
          "Qualification Period",
        extraQualificationLabel:
          extraTrack?.qualification_label ||
          trip.extra_qualification_label ||
          "Extra Slots Period",
        originalCashFlowBelowRvp:
          Number(trip.original_cash_flow_below_rvp) || 0,
        originalCashFlowRvp:
          Number(trip.original_cash_flow_rvp) || 0,
        originalCategoryRules: nextOriginalRules,
        extraCategoryRules: nextExtraRules,
      };

      applyTripProfile(loadedProfile);
      setPublishedTrip(loadedProfile);

      const { data: allTrips, error: allTripsError } = await supabase
        .from("trip_profiles")
        .select(
          "id, name, subtitle, original_qualification_label, extra_qualification_label, original_cash_flow_below_rvp, original_cash_flow_rvp, is_active, created_at",
        )
        .order("created_at", { ascending: true });

      if (allTripsError || !allTrips) {
        setSavedTrips([loadedProfile]);
      } else {
        const allTripIds = allTrips.map((item) => item.id);

        const { data: allTracks } =
          allTripIds.length > 0
            ? await supabase
                .from("competition_tracks")
                .select(
                  "id, trip_profile_id, track_key, qualification_label, is_enabled",
                )
                .in("trip_profile_id", allTripIds)
                .eq("is_enabled", true)
            : { data: [] };

        const allTrackIds = (allTracks ?? []).map((item) => item.id);

        const { data: allCategories } =
          allTrackIds.length > 0
            ? await supabase
                .from("competition_categories")
                .select(
                  "competition_track_id, category_key, label, winning_slots, slots_label, is_enabled",
                )
                .in("competition_track_id", allTrackIds)
                .eq("is_enabled", true)
            : { data: [] };

        const profiles = allTrips.map((item) => {
          const itemTracks = (allTracks ?? []).filter(
            (track) => track.trip_profile_id === item.id,
          );
          const itemOriginalTrack = itemTracks.find(
            (track) => track.track_key === "original",
          );
          const itemExtraTrack = itemTracks.find(
            (track) => track.track_key === "extra_slots",
          );

          const itemOriginalRules = cloneOriginalRules(ORIGINAL_CATEGORIES);
          const itemExtraRules = cloneExtraRules(EXTRA_SLOT_CATEGORIES);

          (allCategories ?? [])
            .filter(
              (category) =>
                category.competition_track_id === itemOriginalTrack?.id,
            )
            .forEach((category) => {
              const key =
                category.category_key as OriginalCompetitionCategory;

              if (key in itemOriginalRules) {
                itemOriginalRules[key] = {
                  label: category.label,
                  winningSlots: Number(category.winning_slots) || 0,
                  slotsLabel:
                    category.slots_label ||
                    `${whole.format(Number(category.winning_slots) || 0)} U.S. Slots`,
                };
              }
            });

          (allCategories ?? [])
            .filter(
              (category) =>
                category.competition_track_id === itemExtraTrack?.id,
            )
            .forEach((category) => {
              const key =
                category.category_key as ExtraCompetitionCategory;

              if (key in itemExtraRules) {
                itemExtraRules[key] = {
                  label: category.label,
                  winningSlots: Number(category.winning_slots) || 0,
                  slotsLabel:
                    category.slots_label ||
                    `${whole.format(Number(category.winning_slots) || 0)} Extra U.S. Slots`,
                };
              }
            });

          return {
            id: item.id,
            tripName: item.name,
            tripSubtitle: item.subtitle || "",
            originalQualificationLabel:
              itemOriginalTrack?.qualification_label ||
              item.original_qualification_label ||
              "Qualification Period",
            extraQualificationLabel:
              itemExtraTrack?.qualification_label ||
              item.extra_qualification_label ||
              "Extra Slots Period",
            originalCashFlowBelowRvp:
              Number(item.original_cash_flow_below_rvp) || 0,
            originalCashFlowRvp:
              Number(item.original_cash_flow_rvp) || 0,
            originalCategoryRules: itemOriginalRules,
            extraCategoryRules: itemExtraRules,
          } satisfies SavedTripProfile;
        });

        setSavedTrips(profiles);
        window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(profiles));
      }

      setBppRules(nextBppRules);
      setDatabaseStatus("connected");
      setDatabaseMessage(
        "Connected to the shared Supabase trip configuration.",
      );
    }

    void loadSupabaseConfiguration();

    return () => {
      cancelled = true;
    };
  }, []);

  const strategyBpp = useMemo(
    () =>
      strategy.recruits * bppRules.recruit +
      strategy.premium * bppRules.premiumMultiplier +
      strategy.initialTrades * bppRules.initialTrade +
      strategy.securitiesProduction *
        (bppRules.securitiesProductionPercent / 100) +
      strategy.mortgageProduction *
        (bppRules.mortgageProductionPercent / 100) +
      strategy.lifeLicenses * bppRules.lifeLicense +
      strategy.securitiesLicenses * bppRules.securitiesLicense +
      strategy.mortgageLicenses * bppRules.mortgageLicense +
      strategy.qualifies * bppRules.qualify +
      strategy.playUps * bppRules.playUp,
    [strategy, bppRules],
  );

  const coachingTarget = winningLine + safetyMargin;
  const projectedBpp = currentBpp + strategyBpp;
  const gapToLine = Math.max(0, winningLine - currentBpp);
  const gapToTarget = Math.max(0, coachingTarget - currentBpp);
  const projectedTargetGap = Math.max(0, coachingTarget - projectedBpp);

  const levelRule = LEVEL_RULES[leadershipLevel];
  const selectedTrack =
    competitionTrack === "original"
      ? {
          label: COMPETITION_TRACKS.original.label,
          qualificationLabel: originalQualificationLabel,
        }
      : {
          label: COMPETITION_TRACKS.extra_slots.label,
          qualificationLabel: extraQualificationLabel,
        };
  const availableCategories =
    competitionTrack === "original"
      ? originalCategoryRules
      : extraCategoryRules;
  const selectedCategory =
    availableCategories[
      competitionCategory as keyof typeof availableCategories
    ] ??
    (competitionTrack === "original"
      ? originalCategoryRules.us_future_regional_leader
      : extraCategoryRules.us_future_regional_leader);

  const isOriginalLifeLicensedCategory =
    competitionTrack === "original" &&
    competitionCategory === "us_life_licensed_after_june_5";
  const isExtraLifeLicensedCategory =
    competitionTrack === "extra_slots" &&
    competitionCategory === "us_newly_life_licensed";
  const usesCompetitionPremiumMinimum =
    isOriginalLifeLicensedCategory || isExtraLifeLicensedCategory;
  const competitionPremiumMinimum = isOriginalLifeLicensedCategory
    ? 7000
    : isExtraLifeLicensedCategory
      ? 4000
      : 0;
  const competitionPremiumNeed = Math.max(
    0,
    competitionPremiumMinimum - competitionPremium,
  );
  const competitionPremiumOnTarget =
    usesCompetitionPremiumMinimum &&
    competitionPremium >= competitionPremiumMinimum;

  const belowRvp = leadershipLevel !== "rvp";
  const personalDirectNeed = belowRvp ? Math.max(0, 1 - directRecruits) : 0;
  const personalPremiumNeed = belowRvp ? Math.max(0, 1000 - personalPremium) : 0;
  const qualifyRecruitNeed = Math.max(0, levelRule.qualifyRecruits - monthlyRecruits);
  const qualifyPremiumNeed = Math.max(0, levelRule.qualifyPremium - monthlyPremium);
  const playUpAvailable =
    levelRule.playUpRecruits !== null && levelRule.playUpPremium !== null;
  const playUpRecruitNeed = playUpAvailable
    ? Math.max(0, (levelRule.playUpRecruits ?? 0) - monthlyRecruits)
    : 0;
  const playUpPremiumNeed = playUpAvailable
    ? Math.max(0, (levelRule.playUpPremium ?? 0) - monthlyPremium)
    : 0;
  const qualifiesNow =
    qualifyRecruitNeed === 0 &&
    qualifyPremiumNeed === 0 &&
    personalDirectNeed === 0 &&
    personalPremiumNeed === 0;
  const playsUpNow =
    playUpAvailable &&
    playUpRecruitNeed === 0 &&
    playUpPremiumNeed === 0 &&
    personalDirectNeed === 0 &&
    personalPremiumNeed === 0;
  const qualifyPlayUpPotential = playUpAvailable
    ? playsUpNow
      ? 0
      : qualifiesNow
        ? bppRules.playUp
        : bppRules.qualify + bppRules.playUp
    : qualifiesNow
      ? 0
      : bppRules.qualify;
  const licensesToTarget = Math.max(
    0,
    Math.ceil(gapToTarget / Math.max(1, bppRules.lifeLicense)),
  );

  // Full-period cash-flow minimums are editable in Trip Setup.
  // Extra Slots remains a separate August-November competition.
  const originalCashFlowMinimum =
    leadershipLevel === "rvp"
      ? originalCashFlowRvp
      : originalCashFlowBelowRvp;
  const competitionCashFlowMinimum =
    competitionTrack === "original"
      ? originalCashFlowMinimum
      : extraCashFlowMinimum;
  const cashFlowMinimumSet =
    !usesCompetitionPremiumMinimum && competitionCashFlowMinimum > 0;
  const competitionCashFlowNeed = Math.max(
    0,
    competitionCashFlowMinimum - competitionCashFlow,
  );
  const cashFlowOnTarget =
    !usesCompetitionPremiumMinimum &&
    cashFlowMinimumSet &&
    competitionCashFlow >= competitionCashFlowMinimum;

  const generatedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const printShortfalls: string[] = [];

  if (gapToLine > 0) {
    printShortfalls.push(
      `BPP: ${whole.format(gapToLine)} points below the current winning line.`,
    );
  }

  if (qualifyRecruitNeed > 0 || qualifyPremiumNeed > 0) {
    printShortfalls.push(
      `Qualify at ${levelRule.label}: still need ${whole.format(qualifyRecruitNeed)} recruit${qualifyRecruitNeed === 1 ? "" : "s"} and $${whole.format(qualifyPremiumNeed)} premium.`,
    );
  }

  if (
    playUpAvailable &&
    !playsUpNow &&
    (playUpRecruitNeed > 0 || playUpPremiumNeed > 0)
  ) {
    printShortfalls.push(
      `Play Up: still need ${whole.format(playUpRecruitNeed)} recruit${playUpRecruitNeed === 1 ? "" : "s"} and $${whole.format(playUpPremiumNeed)} premium.`,
    );
  }

  if (belowRvp && (personalDirectNeed > 0 || personalPremiumNeed > 0)) {
    printShortfalls.push(
      `Personal requirement: still need ${whole.format(personalDirectNeed)} direct recruit${personalDirectNeed === 1 ? "" : "s"} and $${whole.format(personalPremiumNeed)} personal premium.`,
    );
  }

  if (usesCompetitionPremiumMinimum && !competitionPremiumOnTarget) {
    printShortfalls.push(
      `Competition premium: still need $${whole.format(competitionPremiumNeed)} to reach the $${whole.format(competitionPremiumMinimum)} minimum for ${selectedCategory.label}.`,
    );
  } else if (cashFlowMinimumSet && !cashFlowOnTarget) {
    printShortfalls.push(
      `Competition cash flow: still need $${whole.format(competitionCashFlowNeed)} to reach the full-period minimum.`,
    );
  } else if (!usesCompetitionPremiumMinimum && !cashFlowMinimumSet) {
    printShortfalls.push(
      "Competition cash-flow minimum has not been entered for this track yet.",
    );
  }

  const coachModeActions = [
    strategy.playUps > 0
      ? `${whole.format(strategy.playUps)} Play Up${strategy.playUps === 1 ? "" : "s"}`
      : "",
    strategy.lifeLicenses > 0
      ? `${whole.format(strategy.lifeLicenses)} life license${strategy.lifeLicenses === 1 ? "" : "s"}`
      : "",
    strategy.securitiesLicenses > 0
      ? `${whole.format(strategy.securitiesLicenses)} securities license/exam${strategy.securitiesLicenses === 1 ? "" : "s"}`
      : "",
    strategy.mortgageLicenses > 0
      ? `${whole.format(strategy.mortgageLicenses)} mortgage license${strategy.mortgageLicenses === 1 ? "" : "s"}`
      : "",
    strategy.recruits > 0
      ? `${whole.format(strategy.recruits)} recruit${strategy.recruits === 1 ? "" : "s"}`
      : "",
    strategy.premium > 0
      ? `$${whole.format(strategy.premium)} life premium`
      : "",
    strategy.initialTrades > 0
      ? `${whole.format(strategy.initialTrades)} initial securities trade${strategy.initialTrades === 1 ? "" : "s"}`
      : "",
    strategy.securitiesProduction > 0
      ? `$${whole.format(strategy.securitiesProduction)} securities production`
      : "",
    strategy.mortgageProduction > 0
      ? `$${whole.format(strategy.mortgageProduction)} mortgage production`
      : "",
    strategy.qualifies > 0
      ? `${whole.format(strategy.qualifies)} monthly Qualif${strategy.qualifies === 1 ? "y" : "ies"}`
      : "",
  ].filter(Boolean);

  function update<K extends keyof Strategy>(key: K, value: Strategy[K]) {
    setStrategy((current) => ({ ...current, [key]: value }));
  }

  async function verifyAdminPasscode() {
    setAdminLoginError("");
    setAdminLoginLoading(true);

    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          passcode: adminPasscode,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !result.success) {
        setAdminLoginError(
          result.message || "That passcode is not correct.",
        );
        return;
      }

      setAdminUnlocked(true);
      setShowAdminLogin(false);
      setShowTripSetup(true);
      setAdminPasscode("");
      setAdminLoginError("");
    } catch {
      setAdminLoginError(
        "Unable to verify the admin passcode. Please try again.",
      );
    } finally {
      setAdminLoginLoading(false);
    }
  }

  function handleAdminButtonClick() {
    if (adminUnlocked) {
      if (showTripSetup) {
        if (publishedTrip) {
          applyTripProfile(publishedTrip);
        }

        setShowTripSetup(false);
        setAdminSaveMessage("");
        setAdminSaveError("");
        return;
      }

      setShowTripSetup(true);
      return;
    }

    setAdminLoginError("");
    setAdminPasscode("");
    setShowAdminLogin(true);
  }

  async function saveTripToSupabase(setActive: boolean) {
    setAdminSaveLoading(true);
    setAdminSaveMessage("");
    setAdminSaveError("");

    try {
      const response = await fetch("/api/admin/trips/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trip: {
            id: activeTripId,
            name: tripName,
            subtitle: tripSubtitle,
            originalQualificationLabel,
            extraQualificationLabel,
            originalCashFlowBelowRvp,
            originalCashFlowRvp,
          },
          originalCategories: originalCategoryRules,
          extraCategories: extraCategoryRules,
          bppRules: {
            recruit: bppRules.recruit,
            premium_multiplier: bppRules.premiumMultiplier,
            initial_trade: bppRules.initialTrade,
            securities_production_percent:
              bppRules.securitiesProductionPercent,
            mortgage_production_percent:
              bppRules.mortgageProductionPercent,
            life_license: bppRules.lifeLicense,
            securities_license: bppRules.securitiesLicense,
            mortgage_license: bppRules.mortgageLicense,
            qualify: bppRules.qualify,
            play_up: bppRules.playUp,
          },
          setActive,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        tripId?: string;
      };

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          setAdminUnlocked(false);
          setShowTripSetup(false);
          setShowAdminLogin(true);
        }

        setAdminSaveError(
          result.message || "Unable to save the trip to Supabase.",
        );
        return;
      }

      const savedTripId = result.tripId || activeTripId;

      if (result.tripId) {
        setActiveTripId(result.tripId);
      }

      const localProfile = currentTripProfile(savedTripId);
      const exists = savedTrips.some((trip) => trip.id === savedTripId);
      const nextTrips = exists
        ? savedTrips.map((trip) =>
            trip.id === savedTripId ? localProfile : trip,
          )
        : [...savedTrips, localProfile];

      persistTrips(nextTrips);

      setAdminSaveMessage(
        result.message ||
          (setActive
            ? "Trip saved and published as the active trip."
            : "Trip saved to Supabase."),
      );

      if (setActive) {
        setPublishedTrip(localProfile);
        setDatabaseStatus("connected");
        setDatabaseMessage(
          "This trip is now the shared active Supabase configuration.",
        );
      }
    } catch {
      setAdminSaveError(
        "Unable to reach the Admin save route. Please try again.",
      );
    } finally {
      setAdminSaveLoading(false);
    }
  }

  async function deleteSelectedTrip() {
    if (!publishedTrip) {
      setAdminSaveError("The published active trip could not be determined.");
      return;
    }

    if (activeTripId === publishedTrip.id) {
      setAdminSaveError(
        "The published active trip cannot be deleted. Publish another trip first.",
      );
      return;
    }

    const selected = savedTrips.find((trip) => trip.id === activeTripId);

    if (!selected) {
      setAdminSaveError("Select a saved trip to delete.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${selected.tripName} — ${selected.tripSubtitle}"? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setAdminDeleteLoading(true);
    setAdminSaveMessage("");
    setAdminSaveError("");

    try {
      if (!isUuid(selected.id)) {
        const remaining = savedTrips.filter((trip) => trip.id !== selected.id);
        persistTrips(remaining);
        applyTripProfile(publishedTrip);
        setAdminSaveMessage("Unsaved draft removed.");
        return;
      }

      const response = await fetch("/api/admin/trips/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tripId: selected.id,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        tripId?: string;
      };

      if (!response.ok || !result.success) {
        if (response.status === 401) {
          setAdminUnlocked(false);
          setShowTripSetup(false);
          setShowAdminLogin(true);
        }

        setAdminSaveError(
          result.message || "Unable to delete the selected trip.",
        );
        return;
      }

      const remaining = savedTrips.filter((trip) => trip.id !== selected.id);
      persistTrips(remaining);
      applyTripProfile(publishedTrip);
      setAdminSaveMessage(result.message || "Trip deleted.");
    } catch {
      setAdminSaveError(
        "Unable to reach the Admin delete route. Please try again.",
      );
    } finally {
      setAdminDeleteLoading(false);
    }
  }

  function downloadCoachingPlanPdf() {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 34;
    const contentWidth = pageWidth - margin * 2;

    const navy: [number, number, number] = [23, 57, 58];
    const gold: [number, number, number] = [177, 135, 69];
    const slate: [number, number, number] = [71, 85, 105];
    const lightSlate: [number, number, number] = [248, 250, 252];
    const cream: [number, number, number] = [255, 250, 240];
    const teal: [number, number, number] = [26, 127, 134];

    const safe = (value: string) =>
      value.replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "-");

    const addLabel = (label: string, x: number, y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...gold);
      doc.text(label.toUpperCase(), x, y);
    };

    const addWrappedText = (
      value: string,
      x: number,
      y: number,
      width: number,
      fontSize = 9,
      color: [number, number, number] = slate,
      lineHeight = 12,
    ) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(value, width) as string[];
      doc.text(lines, x, y);
      return y + Math.max(1, lines.length) * lineHeight;
    };

    // Header
    addLabel("Trip Strategy Coach", margin, 35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...navy);
    doc.text("Coaching Action Plan", margin, 56);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...slate);
    doc.text(`${tripName} - ${tripSubtitle}`, margin, 72);

    doc.setFontSize(8);
    doc.text(selectedTrack.qualificationLabel, pageWidth - margin, 38, {
      align: "right",
    });
    doc.text(`Generated ${generatedDate}`, pageWidth - margin, 52, {
      align: "right",
    });

    doc.setDrawColor(...navy);
    doc.setLineWidth(1.5);
    doc.line(margin, 82, pageWidth - margin, 82);

    // Profile strip
    const profileY = 94;
    const profileGap = 6;
    const profileW = (contentWidth - profileGap * 3) / 4;
    const profileItems = [
      ["Name", coachName || "Teammate"],
      ["Level", levelRule.label],
      ["Category", selectedCategory.label],
      ["Winning Slots", selectedCategory.slotsLabel],
    ];

    profileItems.forEach(([label, value], index) => {
      const x = margin + index * (profileW + profileGap);
      doc.setFillColor(...lightSlate);
      doc.roundedRect(x, profileY, profileW, 44, 5, 5, "F");
      addLabel(label, x + 8, profileY + 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...navy);
      const lines = doc.splitTextToSize(value, profileW - 16) as string[];
      doc.text(lines.slice(0, 2), x + 8, profileY + 27);
    });

    // WHERE I AM
    let y = 153;
    addLabel("Where I Am", margin, y);
    y += 8;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 97, 7, 7, "S");

    const statY = y + 12;
    const statGap = 6;
    const statW = (contentWidth - 20 - statGap * 3) / 4;
    const statItems = [
      ["Current BPP", whole.format(currentBpp)],
      ["Current Rank", `#${whole.format(rank)}`],
      ["Winning Line", whole.format(winningLine)],
      [
        "Position",
        gapToLine > 0
          ? `${whole.format(gapToLine)} below`
          : `${whole.format(currentBpp - winningLine)} above`,
      ],
    ];

    statItems.forEach(([label, value], index) => {
      const x = margin + 10 + index * (statW + statGap);
      doc.setFillColor(...lightSlate);
      doc.roundedRect(x, statY, statW, 42, 5, 5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...slate);
      doc.text(label, x + 7, statY + 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...navy);
      doc.text(value, x + 7, statY + 29);
    });

    const activityY = statY + 52;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...slate);
    doc.text(
      `This month: ${whole.format(monthlyRecruits)} recruits | $${whole.format(monthlyPremium)} premium | ${whole.format(directRecruits)} direct recruit${directRecruits === 1 ? "" : "s"} | $${whole.format(personalPremium)} personal premium`,
      margin + 10,
      activityY + 13,
    );

    // WHERE I'M FALLING SHORT
    y += 114;
    addLabel("Where I'm Falling Short", margin, y);
    y += 8;

    const shortfallBoxY = y;
    const shortfallLines =
      printShortfalls.length > 0
        ? printShortfalls
        : ["Current tracked qualification requirements are met."];

    const wrappedShortfalls = shortfallLines.flatMap((item) =>
      doc.splitTextToSize(`• ${item}`, contentWidth - 24) as string[],
    );
    const shortfallHeight = Math.max(54, 24 + wrappedShortfalls.length * 11);

    doc.setFillColor(...cream);
    doc.setDrawColor(228, 196, 119);
    doc.roundedRect(
      margin,
      shortfallBoxY,
      contentWidth,
      shortfallHeight,
      7,
      7,
      "FD",
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...slate);

    let shortY = shortfallBoxY + 18;
    shortfallLines.forEach((item) => {
      const lines = doc.splitTextToSize(`• ${item}`, contentWidth - 24) as string[];
      doc.text(lines, margin + 12, shortY);
      shortY += lines.length * 11;
    });

    // WHAT I NEED TO DO
    y = shortfallBoxY + shortfallHeight + 17;
    addLabel("What I Need to Do", margin, y);
    y += 8;

    const actionBoxY = y;
    const actionBoxHeight = 210;
    doc.setFillColor(...navy);
    doc.roundedRect(
      margin,
      actionBoxY,
      contentWidth,
      actionBoxHeight,
      7,
      7,
      "F",
    );

    const actionTitle =
      strategyMode === "coach"
        ? strategyName || "Coach's Custom Strategy"
        : playUpAvailable
          ? playsUpNow
            ? "Build the Remaining BPP Gap"
            : qualifiesNow
              ? "Play Up"
              : "Qualify + Play Up"
          : qualifiesNow
            ? "Build the Remaining BPP Gap"
            : "Qualify at Your Level";

    const projectedAdd =
      strategyMode === "coach" ? strategyBpp : qualifyPlayUpPotential;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    doc.text(actionTitle, margin + 14, actionBoxY + 25);

    doc.setFontSize(7);
    doc.setTextColor(210, 220, 220);
    doc.text("PROJECTED ADD", pageWidth - margin - 14, actionBoxY + 14, {
      align: "right",
    });
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `+${whole.format(projectedAdd)} BPP`,
      pageWidth - margin - 14,
      actionBoxY + 30,
      { align: "right" },
    );

    let actionY = actionBoxY + 46;

    if (strategyMode === "coach") {
      if (coachNotes) {
        actionY = addWrappedText(
          coachNotes,
          margin + 14,
          actionY,
          contentWidth - 28,
          8.5,
          [218, 226, 226],
          11,
        );
        actionY += 3;
      }

      if (coachModeActions.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        coachModeActions.forEach((action) => {
          doc.text(`• ${action}`, margin + 14, actionY);
          actionY += 13;
        });
      } else {
        actionY = addWrappedText(
          "Add activity in Coach Mode before downloading this plan.",
          margin + 14,
          actionY,
          contentWidth - 28,
          9,
          [218, 226, 226],
          12,
        );
      }
    } else {
      const recommendedActions: string[] = [];

      if (
        belowRvp &&
        (personalDirectNeed > 0 || personalPremiumNeed > 0)
      ) {
        recommendedActions.push(
          `Finish the personal requirement: ${whole.format(personalDirectNeed)} direct recruit${personalDirectNeed === 1 ? "" : "s"} and $${whole.format(personalPremiumNeed)} personal premium.`,
        );
      }

      if (!qualifiesNow) {
        recommendedActions.push(
          `Qualify at ${levelRule.label}: add ${whole.format(qualifyRecruitNeed)} recruit${qualifyRecruitNeed === 1 ? "" : "s"} and $${whole.format(qualifyPremiumNeed)} premium.`,
        );
      }

      if (playUpAvailable && !playsUpNow) {
        recommendedActions.push(
          `Reach Play Up: add ${whole.format(playUpRecruitNeed)} recruit${playUpRecruitNeed === 1 ? "" : "s"} and $${whole.format(playUpPremiumNeed)} premium for the additional ${whole.format(bppRules.playUp)} BPP.`,
        );
      }

      if (gapToTarget > 0) {
        recommendedActions.push(
          `Supporting option: ${whole.format(licensesToTarget)} life license${licensesToTarget === 1 ? "" : "s"} at the current default value would add approximately ${whole.format(licensesToTarget * bppRules.lifeLicense)} BPP toward the coaching target.`,
        );
      }

      if (recommendedActions.length === 0) {
        recommendedActions.push(
          "Current tracked targets are complete. Focus on protecting the winning position and continuing productive activity.",
        );
      }

      recommendedActions.forEach((action, index) => {
        const lines = doc.splitTextToSize(
          `${index + 1}. ${action}`,
          contentWidth - 28,
        ) as string[];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.7);
        doc.setTextColor(255, 255, 255);
        doc.text(lines, margin + 14, actionY);
        actionY += lines.length * 11 + 3;
      });
    }

    const summaryY = actionBoxY + actionBoxHeight - 43;
    doc.setDrawColor(80, 115, 116);
    doc.line(margin + 14, summaryY - 8, pageWidth - margin - 14, summaryY - 8);

    const summaryW = (contentWidth - 28) / 3;
    const summaryItems = [
      ["Current BPP", whole.format(currentBpp)],
      ["Winning Line", whole.format(winningLine)],
      ["Coaching Target", whole.format(coachingTarget)],
    ];

    summaryItems.forEach(([label, value], index) => {
      const x = margin + 14 + index * summaryW;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(185, 202, 202);
      doc.text(label.toUpperCase(), x, summaryY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(value, x, summaryY + 15);
    });

    // Footer
    const footerY = 758;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...slate);
    const footer =
      "This coaching action plan is a planning estimate only. Official competition credit, qualification status, rankings, minimums, and trip awards are determined by Primerica under the applicable rules.";
    const footerLines = doc.splitTextToSize(footer, contentWidth) as string[];
    doc.text(footerLines, margin, footerY);

    const fileName = safe(coachName || "teammate") || "teammate";
    doc.save(`${fileName}-coaching-action-plan.pdf`);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f4ed] text-slate-900">
      <style jsx global>{`
        .print-only {
          display: none;
        }

        @media print {
          @page {
            size: letter;
            margin: 0;
          }

          html,
          body {
            width: 8.5in !important;
            height: 11in !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }

          .screen-only {
            display: none !important;
          }

          .print-only {
            display: block !important;
            position: fixed !important;
            inset: 0 !important;
            width: 8.5in !important;
            height: 11in !important;
            margin: 0 !important;
            padding: 0.28in !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }

          .print-page {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            zoom: 0.9;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .print-page section,
          .print-page header,
          .print-page footer {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="screen-only w-full max-w-full overflow-x-hidden">
      <section className="border-b border-black/5 bg-[#17393a] px-4 pb-4 pt-5 text-white md:hidden">
        <div className="mx-auto w-full max-w-md min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#e2c88e]">
              Trip Strategy Coach
            </p>
            <button
              type="button"
              onClick={handleAdminButtonClick}
              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/90"
            >
              Admin
            </button>
          </div>

          <div className="mt-4 rounded-[22px] bg-[#fffdf8] p-4 text-slate-900 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold tracking-[-0.03em] text-[#17393a]">
                  {tripName}
                </h1>
                <p className="mt-0.5 text-lg font-medium text-[#b18745]">{tripSubtitle}</p>
              </div>
              <span className="rounded-full bg-[#f3ecd9] px-3 py-1.5 text-[11px] font-bold text-[#17393a]">
                {selectedTrack.qualificationLabel}
              </span>
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 pt-3">
              <div className="min-w-0 pr-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Category</p>
                <p className="mt-1 break-words text-[10px] font-bold leading-4 text-[#17393a]">{selectedCategory.label}</p>
              </div>
              <div className="min-w-0 px-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Winning Slots</p>
                <p className="mt-1 break-words text-[10px] font-bold leading-4 text-[#17393a]">{selectedCategory.slotsLabel}</p>
              </div>
              <div className="min-w-0 pl-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Track</p>
                <p className="mt-1 break-words text-[10px] font-bold leading-4 text-[#17393a]">{selectedTrack.label}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="hidden border-b border-black/5 bg-[radial-gradient(circle_at_top_left,_rgba(80,190,200,0.24),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(215,178,101,0.25),_transparent_30%),linear-gradient(135deg,#f7f4ed_0%,#fffdf8_55%,#edf9f7_100%)] md:block">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#9a7639]">Trip Strategy Coach</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#17393a] sm:text-5xl">
                {tripName}
                <span className="block font-light text-[#b18745]">{tripSubtitle}</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                See where you are, what you need, and the activity that can move you toward a winning position.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Qualification", selectedTrack.qualificationLabel],
                ["Category", selectedCategory.label],
                ["Winning Slots", selectedCategory.slotsLabel],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-bold text-[#17393a]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8 lg:py-10">
        <div className="hidden flex-wrap justify-end gap-3 md:flex">
          <button
            type="button"
            onClick={handleAdminButtonClick}
            className="rounded-2xl border border-[#17393a]/15 bg-white px-5 py-3 text-sm font-bold text-[#17393a] shadow-sm transition hover:bg-slate-50"
          >
            {adminUnlocked && showTripSetup
              ? "Close Trip Setup"
              : adminUnlocked
                ? "Trip Setup / Admin"
                : "Trip Setup / Admin — Locked"}
          </button>
          <button
            type="button"
            onClick={downloadCoachingPlanPdf}
            className="rounded-2xl bg-[#17393a] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#214a4b]"
          >
            Download Coaching Plan PDF
          </button>
        </div>

        <div
          className={`hidden rounded-2xl border px-4 py-3 text-sm md:block ${
            databaseStatus === "connected"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : databaseStatus === "error"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          <span className="font-bold">
            {databaseStatus === "connected"
              ? "Shared Trip Data Connected"
              : databaseStatus === "error"
                ? "Using Local Defaults"
                : "Connecting to Shared Trip Data"}
          </span>
          <span className="ml-2">{databaseMessage}</span>
        </div>

        {showAdminLogin ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">
                    Admin Access
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#17393a]">
                    Unlock Trip Setup
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Enter the admin passcode to edit trip settings and competition rules.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAdminLogin(false);
                    setAdminPasscode("");
                    setAdminLoginError("");
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
                  aria-label="Close admin access"
                >
                  ×
                </button>
              </div>

              <form
                className="mt-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void verifyAdminPasscode();
                }}
              >
                <label className="block min-w-0">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Admin Passcode
                  </span>
                  <input
                    type="password"
                    value={adminPasscode}
                    onChange={(event) => {
                      setAdminPasscode(event.target.value);
                      if (adminLoginError) {
                        setAdminLoginError("");
                      }
                    }}
                    autoFocus
                    autoComplete="current-password"
                    placeholder="Enter passcode"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                  />
                </label>

                {adminLoginError ? (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {adminLoginError}
                  </p>
                ) : null}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminLogin(false);
                      setAdminPasscode("");
                      setAdminLoginError("");
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={adminLoginLoading || adminPasscode.trim().length === 0}
                    className="flex-1 rounded-2xl bg-[#17393a] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#214a4b] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {adminLoginLoading ? "Verifying..." : "Unlock Admin"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {showTripSetup && adminUnlocked ? (
          <section className="fixed inset-0 z-40 overflow-y-auto bg-[#fffdf8] p-4 shadow-2xl md:static md:inset-auto md:z-auto md:overflow-visible md:rounded-[28px] md:border-2 md:border-[#d8c59c] md:p-6 md:shadow-sm sm:md:p-8">
            <div className="mb-4 flex items-center justify-between md:hidden">
              <p className="text-sm font-bold text-[#17393a]">Trip Setup / Admin</p>
              <button
                type="button"
                onClick={() => setShowTripSetup(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">
                  Trip Setup / Admin
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[#17393a]">
                  Configure Trips
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Create and edit trip details, qualification periods, cash-flow minimums,
                  categories, and winning slots without changing the coaching code.
                </p>
              </div>
              <div className="rounded-2xl bg-[#17393a] px-4 py-3 text-white">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
                  Published Active Trip
                </p>
                <p className="mt-1 text-sm font-bold">
                  {publishedTrip?.tripName || tripName}
                </p>
                <p className="text-xs text-white/70">
                  {publishedTrip?.tripSubtitle || tripSubtitle}
                </p>
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto_auto_auto_auto] xl:items-end">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Saved Trip Profiles
                  </span>
                  <select
                    value={activeTripId}
                    onChange={(event) => {
                      const selected = savedTrips.find(
                        (trip) => trip.id === event.target.value,
                      );

                      if (selected) {
                        applyTripProfile(selected);
                        setAdminSaveMessage("");
                        setAdminSaveError("");
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                  >
                    {savedTrips.map((trip) => {
                      const isPublished = publishedTrip?.id === trip.id;

                      return (
                        <option key={trip.id} value={trip.id}>
                          {trip.tripName} — {trip.tripSubtitle}
                          {isPublished ? " — PUBLISHED" : " — DRAFT"}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <div className="flex items-center xl:pb-1">
                  <span
                    className={`rounded-full border px-3 py-2 text-xs font-bold ${
                      publishedTrip?.id === activeTripId
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {publishedTrip?.id === activeTripId
                      ? "Published"
                      : "Draft"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={createNewTrip}
                  disabled={adminSaveLoading || adminDeleteLoading}
                  className="rounded-2xl border border-[#17393a]/15 bg-slate-50 px-5 py-3 text-sm font-bold text-[#17393a] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Create New Trip
                </button>

                <button
                  type="button"
                  onClick={() => void saveTripToSupabase(false)}
                  disabled={adminSaveLoading || adminDeleteLoading}
                  className="rounded-2xl border border-[#17393a]/15 bg-white px-5 py-3 text-sm font-bold text-[#17393a] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adminSaveLoading ? "Saving..." : "Save to Supabase"}
                </button>

                <button
                  type="button"
                  onClick={() => void saveTripToSupabase(true)}
                  disabled={adminSaveLoading || adminDeleteLoading}
                  className="rounded-2xl bg-[#17393a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#214a4b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adminSaveLoading
                    ? "Publishing..."
                    : "Save & Publish Active Trip"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-5 text-slate-400">
                  <strong>Save to Supabase</strong> stores the selected trip as a draft/saved trip without changing what public users see.
                  <strong> Save & Publish Active Trip</strong> makes the selected trip the public active trip.
                </p>

                <button
                  type="button"
                  onClick={() => void deleteSelectedTrip()}
                  disabled={
                    adminSaveLoading ||
                    adminDeleteLoading ||
                    publishedTrip?.id === activeTripId
                  }
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    publishedTrip?.id === activeTripId
                      ? "Publish another trip before deleting this one."
                      : "Delete this saved draft."
                  }
                >
                  {adminDeleteLoading ? "Deleting..." : "Delete Trip"}
                </button>
              </div>

              {tripSaveMessage ? (
                <p className="mt-3 text-xs font-semibold text-[#1a7f86]">
                  {tripSaveMessage}
                </p>
              ) : null}

              {adminSaveMessage ? (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  {adminSaveMessage}
                </p>
              ) : null}

              {adminSaveError ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {adminSaveError}
                </p>
              ) : null}
            </div>

            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Trip Name
                </span>
                <input
                  value={tripName}
                  onChange={(event) => setTripName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Destination / Year
                </span>
                <input
                  value={tripSubtitle}
                  onChange={(event) => setTripSubtitle(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Original Qualification Period
                </span>
                <input
                  value={originalQualificationLabel}
                  onChange={(event) => setOriginalQualificationLabel(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Extra Slots Qualification Period
                </span>
                <input
                  value={extraQualificationLabel}
                  onChange={(event) => setExtraQualificationLabel(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
                />
              </label>
            </div>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a7f86]">
                Original Competition Cash-Flow Minimums
              </p>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <Field
                  label="Below RVP — Full Period"
                  value={originalCashFlowBelowRvp}
                  onChange={setOriginalCashFlowBelowRvp}
                  hint="Default: $10,500 for the current trip."
                />
                <Field
                  label="RVP & Above — Full Period"
                  value={originalCashFlowRvp}
                  onChange={setOriginalCashFlowRvp}
                  hint="Default: $28,000 for the current trip."
                />
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a7f86]">
                Original Competition — U.S. Categories
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(originalCategoryRules).map(([key, rule]) => (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Category Name
                      </span>
                      <input
                        value={rule.label}
                        onChange={(event) =>
                          setOriginalCategoryRules((current) => ({
                            ...current,
                            [key]: {
                              ...current[key as OriginalCompetitionCategory],
                              label: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#b78c45]"
                      />
                    </label>
                    <div className="mt-3">
                      <Field
                        label="Winning Slots"
                        value={rule.winningSlots}
                        onChange={(value) =>
                          setOriginalCategoryRules((current) => ({
                            ...current,
                            [key]: {
                              ...current[key as OriginalCompetitionCategory],
                              winningSlots: value,
                              slotsLabel: `${whole.format(value)} U.S. Slots`,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a7f86]">
                Extra Slots Competition — U.S. Categories
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(extraCategoryRules).map(([key, rule]) => (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Category Name
                      </span>
                      <input
                        value={rule.label}
                        onChange={(event) =>
                          setExtraCategoryRules((current) => ({
                            ...current,
                            [key]: {
                              ...current[key as ExtraCompetitionCategory],
                              label: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#b78c45]"
                      />
                    </label>
                    <div className="mt-3">
                      <Field
                        label="Winning Slots"
                        value={rule.winningSlots}
                        onChange={(value) =>
                          setExtraCategoryRules((current) => ({
                            ...current,
                            [key]: {
                              ...current[key as ExtraCompetitionCategory],
                              winningSlots: value,
                              slotsLabel: `${whole.format(value)} Extra U.S. Slots`,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-[24px] border border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1a7f86]">
                  Global BPP Rules
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[#17393a]">
                  Regular Point Rules
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Edit these only when Primerica changes a regular point value. These rules apply to the strategy calculator and are saved with the Admin configuration.
                </p>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
                <Field label="Recruit BPP" value={bppRules.recruit} onChange={(value) => setBppRules((r) => ({ ...r, recruit: value }))} />
                <Field label="Premium BPP per $1" value={bppRules.premiumMultiplier} onChange={(value) => setBppRules((r) => ({ ...r, premiumMultiplier: value }))} />
                <Field label="Initial Trade BPP" value={bppRules.initialTrade} onChange={(value) => setBppRules((r) => ({ ...r, initialTrade: value }))} />
                <Field label="Securities Production %" value={bppRules.securitiesProductionPercent} onChange={(value) => setBppRules((r) => ({ ...r, securitiesProductionPercent: value }))} />
                <Field label="Mortgage Production %" value={bppRules.mortgageProductionPercent} onChange={(value) => setBppRules((r) => ({ ...r, mortgageProductionPercent: value }))} />
                <Field label="Life License BPP" value={bppRules.lifeLicense} onChange={(value) => setBppRules((r) => ({ ...r, lifeLicense: value }))} />
                <Field label="Securities License / Exam BPP" value={bppRules.securitiesLicense} onChange={(value) => setBppRules((r) => ({ ...r, securitiesLicense: value }))} />
                <Field label="Mortgage License BPP" value={bppRules.mortgageLicense} onChange={(value) => setBppRules((r) => ({ ...r, mortgageLicense: value }))} />
                <Field label="Qualify BPP" value={bppRules.qualify} onChange={(value) => setBppRules((r) => ({ ...r, qualify: value }))} />
                <Field label="Play Up BPP" value={bppRules.playUp} onChange={(value) => setBppRules((r) => ({ ...r, playUp: value }))} />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBppRules(DEFAULT_BPP_RULES)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Reset to Regular Defaults
                </button>
                <p className="text-xs leading-5 text-slate-400">
                  Use Save to Supabase or Save &amp; Publish Active Trip above to store these changes.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-[#d8c59c] bg-[#fffaf0] p-4 text-xs leading-5 text-[#785f32]">
              Admin changes can now be written to Supabase through the protected server route.
              Use <strong>Save to Supabase</strong> for a saved draft, or
              <strong> Save & Publish Active Trip</strong> when the configuration is ready for everyone.
              Global BPP rules are saved with the Admin configuration as well.
            </div>
          </section>
        ) : null}

        <div className="space-y-3 md:hidden">
          <section className="min-w-0 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#17393a]">Rep Snapshot</h2>
              <span className="text-[10px] font-semibold text-slate-400">Key inputs</span>
            </div>

            <div className="mt-3 grid min-w-0 grid-cols-2 gap-2.5">
              <label className="block min-w-0">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Teammate Name
                </span>
                <input
                  value={coachName}
                  onChange={(event) => setCoachName(event.target.value)}
                  placeholder="Enter name"
                  className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-xs font-semibold outline-none focus:border-[#b78c45]"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Leadership Level
                </span>
                <select
                  value={leadershipLevel}
                  onChange={(event) => {
                    const nextLevel = event.target.value as LeadershipLevel;
                    setLeadershipLevel(nextLevel);
                    setCompetitionCategory(
                      getDefaultCompetitionCategory(nextLevel, competitionTrack),
                    );
                  }}
                  className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-xs font-semibold outline-none focus:border-[#b78c45]"
                >
                  {Object.entries(LEVEL_RULES).map(([value, rule]) => (
                    <option key={value} value={value}>
                      {rule.label}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label="Current Month Recruits"
                placeholder="e.g. 3"
                blankWhenZero
                value={monthlyRecruits}
                onChange={setMonthlyRecruits}
              />
              <Field
                label="Current Month Premium"
                placeholder="e.g. 3500"
                blankWhenZero
                value={monthlyPremium}
                onChange={setMonthlyPremium}
              />
            </div>

            <details className="mt-3 rounded-xl bg-slate-50">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold text-[#17393a]">
                Additional activity inputs
              </summary>
              <div className="grid min-w-0 grid-cols-2 gap-2.5 border-t border-slate-200 p-3">
                <Field
  label="Direct Recruits"
  placeholder="e.g. 1"
  blankWhenZero
  value={directRecruits}
  onChange={setDirectRecruits}
/>
                <Field label="Personal Premium"
                placeholder="e.g. 1000"
                blankWhenZero value={personalPremium} onChange={setPersonalPremium} />
                <label className="block min-w-0">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Competition Track
                  </span>
                  <select
                    value={competitionTrack}
                    onChange={(event) => {
                      const nextTrack = event.target.value as CompetitionTrack;
                      setCompetitionTrack(nextTrack);
                      setCompetitionCategory(
                        getDefaultCompetitionCategory(leadershipLevel, nextTrack),
                      );
                    }}
                    className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-900 outline-none"
                  >
                    {Object.entries(COMPETITION_TRACKS).map(([value, track]) => (
                      <option key={value} value={value}>
                        {track.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Competition Category
                  </span>
                  <select
                    value={competitionCategory}
                    onChange={(event) =>
                      setCompetitionCategory(
                        event.target.value as CompetitionCategory,
                      )
                    }
                    className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-900 outline-none"
                  >
                    {Object.entries(availableCategories).map(([value, rule]) => (
                      <option key={value} value={value}>
                        {rule.label}
                      </option>
                    ))}
                  </select>
                </label>

                {usesCompetitionPremiumMinimum ? (
                  <div className="col-span-2">
                    <Field
                      label="Current Competition Premium"
                      value={competitionPremium}
                      onChange={setCompetitionPremium}
                      hint={`Minimum for this category: $${whole.format(competitionPremiumMinimum)}. No cash-flow minimum applies.`}
                    />
                  </div>
                ) : (
                  <div className="col-span-2">
                    <Field
                      label="Competition Cash Flow"
                      placeholder="e.g. 6500"
                      blankWhenZero
                      value={competitionCashFlow}
                      onChange={setCompetitionCashFlow}
                    />
                  </div>
                )}
              </div>
            </details>
          </section>

          <section className="min-w-0 rounded-[22px] bg-[#17393a] p-4 text-white shadow-sm">
            <h2 className="text-base font-bold">Coaching Summary</h2>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Current BPP</p>
                <p className="mt-1 text-xl font-bold">{whole.format(currentBpp)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Gap to Win</p>
                <p className="mt-1 text-xl font-bold text-[#e2b65e]">{whole.format(gapToLine)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Status</p>
                <p className="mt-1 text-sm font-bold text-emerald-300">
                  {qualifiesNow ? "Qualified" : "In Progress"}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">Best Next Move</p>
                <p className="mt-1 break-words text-sm font-bold">
                  {playUpAvailable
                    ? qualifiesNow
                      ? "Play Up"
                      : "Qualify + Play Up"
                    : qualifiesNow
                      ? "Build BPP Gap"
                      : "Qualify at Your Level"}
                </p>
              </div>
            </div>
          </section>

          <details className="min-w-0 rounded-[22px] border border-slate-200/80 bg-white shadow-sm" open>
            <summary className="cursor-pointer list-none px-4 py-3.5 text-base font-bold text-[#17393a]">
              Qualification Health
            </summary>
            <div className="border-t border-slate-200 px-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 text-xs">
                <span className="font-semibold text-slate-700">Level Qualification</span>
                <span className="min-w-0 break-words text-right font-bold text-[#17393a]">
                  {whole.format(monthlyRecruits)} / {whole.format(levelRule.qualifyRecruits)} recruits | ${whole.format(monthlyPremium)} / ${whole.format(levelRule.qualifyPremium)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 text-xs">
                <span className="font-semibold text-slate-700">Personal Requirement</span>
                <span className={`font-bold ${personalDirectNeed === 0 && personalPremiumNeed === 0 ? "text-emerald-700" : "text-[#b18745]"}`}>
                  {personalDirectNeed === 0 && personalPremiumNeed === 0 ? "Met" : "Still Needed"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-3 text-xs">
                <span className="font-semibold text-slate-700">
                  {usesCompetitionPremiumMinimum
                    ? "Competition Premium Minimum"
                    : "Competition Cash Flow Minimum"}
                </span>
                <span
                  className={`font-bold ${
                    usesCompetitionPremiumMinimum
                      ? competitionPremiumOnTarget
                        ? "text-emerald-700"
                        : "text-[#b18745]"
                      : cashFlowOnTarget
                        ? "text-emerald-700"
                        : "text-[#17393a]"
                  }`}
                >
                  {usesCompetitionPremiumMinimum
                    ? `$${whole.format(competitionPremium)} / $${whole.format(competitionPremiumMinimum)}`
                    : `$${whole.format(competitionCashFlow)} / $${whole.format(competitionCashFlowMinimum)}`}
                </span>
              </div>
            </div>
          </details>

          <section className="min-w-0 rounded-[22px] border border-[#d8c59c] bg-[#fffdf8] p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#9a7639]">
                  Best First Move
                </p>
                <h2 className="mt-1 text-lg font-bold text-[#17393a]">
                  {playUpAvailable
                    ? playsUpNow
                      ? "Build the Remaining BPP Gap"
                      : qualifiesNow
                        ? "Play Up"
                        : "Qualify + Play Up"
                    : qualifiesNow
                      ? "Build the Remaining BPP Gap"
                      : "Qualify at Your Level"}
                </h2>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Potential BPP Gain</p>
                <p className="mt-1 text-lg font-bold text-[#1f6d47]">
                  +{whole.format(qualifyPlayUpPotential)} BPP
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">What You Still Need</p>
                <p className="mt-1 break-words text-sm font-bold text-[#17393a]">
                  {qualifyRecruitNeed > 0 || qualifyPremiumNeed > 0
                    ? `${whole.format(qualifyRecruitNeed)} recruits / $${whole.format(qualifyPremiumNeed)}`
                    : `${whole.format(gapToTarget)} BPP`}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Coaching Order</p>
                <p className="mt-1 text-base font-bold text-[#17393a]">1 → 2 → 3</p>
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer list-none rounded-xl bg-[#17393a] px-3 py-2.5 text-center text-xs font-bold text-white">
                View Alternative Strategies
              </summary>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-[#17393a]">Licensing Focus</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Each qualifying license can add {whole.format(bppRules.lifeLicense)} BPP.
                    {licensesToTarget > 0 ? ` About ${whole.format(licensesToTarget)} licenses would cover the current coaching target gap.` : ""}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-[#17393a]">Balanced Production</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Combine recruiting, premium, licensing, trades, securities production, and mortgage production.
                  </p>
                </div>
              </div>
            </details>
          </section>

          <details className="min-w-0 rounded-[22px] border border-slate-200/80 bg-white shadow-sm" open>
            <summary className="cursor-pointer list-none px-4 py-3.5 text-base font-bold text-[#17393a]">
              Current Winning Position
            </summary>
            <div className="grid grid-cols-2 border-t border-slate-200 text-center">
              {[
                ["Current BPP", whole.format(currentBpp), "text-[#1f6d47]"],
                ["Current Rank", `#${whole.format(rank)}`, "text-[#17393a]"],
                ["Winning Line", whole.format(winningLine), "text-[#17393a]"],
                ["Your Gap", whole.format(gapToLine), "text-[#b18745]"],
              ].map(([label, value, color], index) => (
                <div
                  key={label}
                  className={`p-3 ${index % 2 === 0 ? "border-r border-slate-200" : ""} ${index < 2 ? "border-b border-slate-200" : ""}`}
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-slate-400">{label}</p>
                  <p className={`mt-1 text-base font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <details className="border-t border-slate-200">
              <summary className="cursor-pointer list-none px-4 py-3 text-center text-xs font-bold text-slate-500">
                Edit position
              </summary>
              <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
                <Field label="Current BPP"
                placeholder="e.g. 850000"
                blankWhenZero value={currentBpp} onChange={setCurrentBpp} />
                <Field label="Current Rank"
                placeholder="e.g. 148"
                blankWhenZero value={rank} onChange={setRank} />
                <div className="col-span-2">
                  <Field label="Current Winning Line"
                placeholder="e.g. 957931.31"
                blankWhenZero value={winningLine} onChange={setWinningLine} />
                </div>
              </div>
            </details>
          </details>

          <details className="min-w-0 rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-3.5">
              <p className="text-base font-bold text-[#17393a]">Regular Point Rules</p>
              <p className="mt-1 text-[10px] text-slate-500">
                Recruit {whole.format(bppRules.recruit)} | License {whole.format(bppRules.lifeLicense)} | Qualify {whole.format(bppRules.qualify)} | Play Up {whole.format(bppRules.playUp)}
              </p>
            </summary>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3">
              {[
                ["Recruit", `${whole.format(bppRules.recruit)} BPP`],
                ["Life License", `${whole.format(bppRules.lifeLicense)} BPP`],
                ["Qualify", `${whole.format(bppRules.qualify)} BPP`],
                ["Play Up", `${whole.format(bppRules.playUp)} BPP`],
                ["Premium", `${precise.format(bppRules.premiumMultiplier)} BPP / $1`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-slate-400">{label}</p>
                  <p className="mt-1 text-xs font-bold text-[#17393a]">{value}</p>
                </div>
              ))}
            </div>
          </details>

          <button
            type="button"
            onClick={handleAdminButtonClick}
            className="w-full rounded-[18px] bg-[#17393a] px-4 py-3.5 text-sm font-bold text-white shadow-sm"
          >
            {adminUnlocked ? "Trip Setup / Admin" : "Trip Setup / Admin (Locked)"}
          </button>

          <button
            type="button"
            onClick={downloadCoachingPlanPdf}
            className="w-full rounded-[18px] border border-[#17393a]/15 bg-white px-4 py-3 text-sm font-bold text-[#17393a]"
          >
            Download Coaching Plan PDF
          </button>
        </div>

        <div className="hidden md:contents">
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">Who Are We Coaching?</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#17393a]">Rep Profile + This Month&apos;s Activity</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Start with the person, their current leadership level, and the activity already completed this month.
            </p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Name</span>
              <input
                value={coachName}
                onChange={(event) => setCoachName(event.target.value)}
                placeholder="Enter teammate name"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Current Leadership Level</span>
              <select
                value={leadershipLevel}
                onChange={(event) => {
                  const nextLevel = event.target.value as LeadershipLevel;
                  setLeadershipLevel(nextLevel);
                  setCompetitionCategory(
                    getDefaultCompetitionCategory(nextLevel, competitionTrack),
                  );
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
              >
                {Object.entries(LEVEL_RULES).map(([value, rule]) => (
                  <option key={value} value={value}>{rule.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Competition Track</span>
              <select
                value={competitionTrack}
                onChange={(event) => {
                  const nextTrack = event.target.value as CompetitionTrack;
                  setCompetitionTrack(nextTrack);
                  setCompetitionCategory(
                    getDefaultCompetitionCategory(leadershipLevel, nextTrack),
                  );
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
              >
                <option value="original">Original Competition — May–Nov</option>
                <option value="extra_slots">Extra Slots Competition — Aug–Nov</option>
              </select>
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                Use Extra Slots when Primerica opens the separate August–November competition.
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Competition Category</span>
              <select
                value={competitionCategory}
                onChange={(event) =>
                  setCompetitionCategory(event.target.value as CompetitionCategory)
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#b78c45] focus:ring-4 focus:ring-[#b78c45]/10"
              >
                {Object.entries(availableCategories).map(([value, rule]) => (
                  <option key={value} value={value}>
                    {rule.label} — {rule.winningSlots} slots
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block text-xs leading-5 text-slate-400">
                U.S.-based categories only. Life-licensed categories use a premium minimum instead of cash flow.
              </span>
            </label>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Current Month Recruits"
                placeholder="e.g. 3"
                blankWhenZero value={monthlyRecruits} onChange={setMonthlyRecruits} hint="Base-shop recruiting activity used for the level target." />
            <Field label="Direct Recruits"
                placeholder="e.g. 1"
                blankWhenZero value={directRecruits} onChange={setDirectRecruits} hint={belowRvp ? "Personal requirement: at least 1 direct recruit." : "Tracked for coaching."} />
            <Field label="Current Month Premium"
                placeholder="e.g. 3500"
                blankWhenZero value={monthlyPremium} onChange={setMonthlyPremium} hint="Premium used toward the level target." />
            <Field label="Personal Premium"
                placeholder="e.g. 1000"
                blankWhenZero value={personalPremium} onChange={setPersonalPremium} hint={belowRvp ? "Personal requirement: at least $1,000." : "Tracked for coaching."} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">Where Am I?</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#17393a]">Current Winning Position</h2>
              </div>
              {winningLine > 0 ? (
                <Status ok={currentBpp >= winningLine} okLabel="Above Current Line" badLabel="Outside Winning Position" />
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  Scoreboard Not Entered
                </span>
              )}
            </div>

            {winningLine > 0 ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Current BPP", whole.format(currentBpp)],
                  ["Current Rank", rank > 0 ? `#${whole.format(rank)}` : "Not entered"],
                  ["Winning Line", precise.format(winningLine)],
                  ["Gap to Line", whole.format(gapToLine)],
                ].map(([label, value], index) => (
                <div key={label} className={`rounded-2xl p-4 ${index === 3 ? "bg-[#fff8e8]" : "bg-slate-50"}`}>
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#17393a]">{value}</p>
                </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
                <p className="font-bold text-[#17393a]">Winning position not entered yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the latest scoreboard numbers below to calculate the current position.
                </p>
              </div>
            )}

            {winningLine > 0 ? <div className="mt-7">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Progress to current winning line</span>
                <span>{Math.min(100, (currentBpp / winningLine) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1a7f86] to-[#d2ac63] transition-all"
                  style={{ width: `${Math.min(100, (currentBpp / winningLine) * 100)}%` }}
                />
              </div>
            </div> : null}

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Field label="Current BPP"
                placeholder="e.g. 850000"
                blankWhenZero value={currentBpp} onChange={setCurrentBpp} />
              <Field label="Current Rank"
                placeholder="e.g. 148"
                blankWhenZero value={rank} onChange={setRank} />
              <Field label="Current Winning Line"
                placeholder="e.g. 957931.31"
                blankWhenZero value={winningLine} onChange={setWinningLine} hint="Update this when you take a new scoreboard snapshot." />
            </div>
          </div>

          <div className="rounded-[28px] bg-[#17393a] p-6 text-white shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e2c88e]">Where Am I Falling Short?</p>
            <h2 className="mt-2 text-2xl font-semibold">What You Still Need</h2>

            <div className="mt-7 space-y-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Qualify This Month at {levelRule.label}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {levelRule.qualifyRecruits} recruits × ${whole.format(levelRule.qualifyPremium)} premium
                    </p>
                  </div>
                  <Status ok={qualifyRecruitNeed === 0 && qualifyPremiumNeed === 0} okLabel="Target Met" badLabel="Still Needed" />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-[#e2c88e]/15 px-3 py-2">
                  <span className="text-xs font-semibold text-white/75">BPP added when completed</span>
                  <span className="text-sm font-bold text-[#f3d99f]">+{whole.format(bppRules.qualify)} BPP</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Recruits</p>
                    <p className="mt-1 font-bold">{monthlyRecruits} / {levelRule.qualifyRecruits}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {qualifyRecruitNeed === 0 ? "Target met" : `Need ${qualifyRecruitNeed} more`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Premium</p>
                    <p className="mt-1 font-bold">${whole.format(monthlyPremium)} / ${whole.format(levelRule.qualifyPremium)}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {qualifyPremiumNeed === 0 ? "Target met" : `Need $${whole.format(qualifyPremiumNeed)} more`}
                    </p>
                  </div>
                </div>
              </div>

              {belowRvp ? (
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Personal Requirement</p>
                      <p className="mt-1 text-xs text-white/60">$1,000 personal premium + 1 direct recruit</p>
                    </div>
                    <Status
                      ok={personalDirectNeed === 0 && personalPremiumNeed === 0}
                      okLabel="Requirement Met"
                      badLabel="Still Needed"
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/70">
                    {personalDirectNeed === 0 && personalPremiumNeed === 0
                      ? "Personal requirement is complete."
                      : `Still need ${personalDirectNeed} direct recruit${personalDirectNeed === 1 ? "" : "s"} + $${whole.format(personalPremiumNeed)} personal premium.`}
                  </p>
                </div>
              ) : null}

              {usesCompetitionPremiumMinimum ? (
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Competition Premium Minimum
                      </p>
                      <p className="mt-1 text-xs text-white/60">
                        {selectedCategory.label}: ${whole.format(competitionPremiumMinimum)} premium minimum. No cash-flow minimum applies.
                      </p>
                    </div>
                    <Status
                      ok={competitionPremiumOnTarget}
                      okLabel="Requirement Met"
                      badLabel="Below Target"
                    />
                  </div>

                  <div className="mt-4">
                    <Field
                      label="Current Competition Premium"
                      value={competitionPremium}
                      onChange={setCompetitionPremium}
                      hint={
                        competitionPremiumOnTarget
                          ? "Competition premium minimum reached."
                          : `Need $${whole.format(competitionPremiumNeed)} more premium to reach the category minimum.`
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Competition Cash Flow Minimum</p>
                      <p className="mt-1 text-xs text-white/60">
                        {competitionTrack === "original"
                          ? `Full ${originalQualificationLabel} qualification period: $${whole.format(competitionCashFlowMinimum)}`
                          : cashFlowMinimumSet
                            ? `Full ${extraQualificationLabel} extra-slots period: $${whole.format(competitionCashFlowMinimum)}`
                            : "Set the official August–November cash-flow minimum below."}
                      </p>
                    </div>
                    <Status
                      ok={cashFlowOnTarget}
                      okLabel="Requirement Met"
                      badLabel={cashFlowMinimumSet ? "Below Target" : "Set Minimum"}
                    />
                  </div>

                  {competitionTrack === "extra_slots" ? (
                    <div className="mt-4">
                      <Field
                        label="Extra Slots Cash Flow Minimum"
                        value={extraCashFlowMinimum}
                        onChange={setExtraCashFlowMinimum}
                        hint="Enter the official total cash-flow minimum for the August–November extra-slots competition."
                      />
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <Field
                      label="Current Competition Cash Flow"
                    placeholder="e.g. 6500"
                    blankWhenZero
                      value={competitionCashFlow}
                      onChange={setCompetitionCashFlow}
                      hint={
                        !cashFlowMinimumSet
                          ? "Set the extra-slots cash-flow minimum first."
                          : cashFlowOnTarget
                            ? "Full competition-period cash flow requirement reached."
                            : `Need $${whole.format(competitionCashFlowNeed)} more to reach the full competition minimum.`
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/70">
              BPP position and qualification health are separate. Strong points do not replace the required level and competition minimums.
            </p>
          </div>
        </section>



        <section className="w-full">
          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">Build My Winning Strategy</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#17393a]">Choose how you want to build the plan</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Use the recommended path for system-generated ideas, or switch to Coach Mode to build a strategy around the person in front of you.
                </p>
              </div>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStrategyMode("recommended")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    strategyMode === "recommended"
                      ? "bg-white text-[#17393a] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Recommended Strategies
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyMode("coach")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    strategyMode === "coach"
                      ? "bg-[#17393a] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Coach Mode
                </button>
              </div>
            </div>

            {strategyMode === "recommended" ? (
              <div className="mt-8 space-y-4">
                <div className="rounded-[24px] border-2 border-[#d4b36e] bg-[#fffaf0] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#9a7639]">Best First Move</p>
                      <h3 className="mt-1 text-xl font-bold text-[#17393a]">
                        {playUpAvailable
                          ? playsUpNow
                            ? "Qualify + Play Up Complete"
                            : qualifiesNow
                              ? "Play Up"
                              : "Qualify + Play Up"
                          : qualifiesNow
                            ? "Qualify Complete"
                            : "Qualify at Your Level"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {playUpAvailable
                          ? playsUpNow
                            ? "You have already earned both the Qualify and Play Up BPP opportunities for this month."
                            : qualifiesNow
                              ? "You have already earned the first 75,000 BPP for Qualifying. The remaining opportunity is the additional 75,000 BPP for Playing Up."
                              : "This is your best first move because it creates the most BPP while also moving your business toward the next level."
                          : qualifiesNow
                            ? "You have already earned the 75,000 BPP Qualify opportunity for this month."
                            : "At RVP, start by securing the monthly Qualify opportunity, then use the remaining BPP gap to build the rest of the strategy."}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#17393a] px-4 py-3 text-right text-white">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">Potential Gain</p>
                      <p className="mt-1 text-xl font-bold">+{whole.format(qualifyPlayUpPotential)} BPP</p>
                    </div>
                  </div>

                  <div className={`mt-5 grid gap-3 ${playUpAvailable ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1a7f86]">Qualify at Your Level</p>
                        <Status ok={qualifiesNow} okLabel="Met" badLabel="In Progress" />
                      </div>
                      <p className="mt-2 text-lg font-bold text-[#17393a]">
                        {levelRule.qualifyRecruits} Recruits × ${whole.format(levelRule.qualifyPremium)} Premium
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        You have {whole.format(monthlyRecruits)} recruits and ${whole.format(monthlyPremium)} premium.
                      </p>
                      <p className="mt-2 text-sm font-bold text-[#17393a]">
                        {qualifyRecruitNeed === 0 && qualifyPremiumNeed === 0
                          ? "Level activity target met."
                          : `Still need ${whole.format(qualifyRecruitNeed)} recruit${qualifyRecruitNeed === 1 ? "" : "s"} + $${whole.format(qualifyPremiumNeed)} premium.`}
                      </p>
                    </div>

                    {playUpAvailable ? (
                      <div className="rounded-2xl bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1a7f86]">Play Up</p>
                          <Status ok={playsUpNow} okLabel="Met" badLabel="In Progress" />
                        </div>
                        <p className="mt-2 text-lg font-bold text-[#17393a]">
                          {levelRule.playUpRecruits} Recruits × ${whole.format(levelRule.playUpPremium ?? 0)} Premium
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          From today&apos;s activity, this is the full next-level target.
                        </p>
                        <p className="mt-2 text-sm font-bold text-[#17393a]">
                          {playUpRecruitNeed === 0 && playUpPremiumNeed === 0
                            ? "Play Up activity target met."
                            : `Still need ${whole.format(playUpRecruitNeed)} recruit${playUpRecruitNeed === 1 ? "" : "s"} + $${whole.format(playUpPremiumNeed)} premium.`}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a7639]">Personal Requirement</p>
                        <Status
                          ok={!belowRvp || (personalDirectNeed === 0 && personalPremiumNeed === 0)}
                          okLabel={belowRvp ? "Met" : "N/A at RVP"}
                          badLabel="Still Needed"
                        />
                      </div>
                      {belowRvp ? (
                        <>
                          <p className="mt-2 text-lg font-bold text-[#17393a]">$1,000 Premium + 1 Direct Recruit</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            You have ${whole.format(personalPremium)} personal premium and {whole.format(directRecruits)} direct recruit{directRecruits === 1 ? "" : "s"}.
                          </p>
                          <p className="mt-2 text-sm font-bold text-[#17393a]">
                            {personalDirectNeed === 0 && personalPremiumNeed === 0
                              ? "Personal requirement met."
                              : `Still need ${whole.format(personalDirectNeed)} direct recruit${personalDirectNeed === 1 ? "" : "s"} + $${whole.format(personalPremiumNeed)} personal premium.`}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          The below-RVP $1,000 personal premium + 1 direct recruit rule is not applied at RVP.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-[#e6d7b7] bg-white/70 px-4 py-3 text-sm text-slate-600">
                    <strong className="text-[#17393a]">Coaching order:</strong>{" "}
                    {playUpAvailable
                      ? playsUpNow
                        ? "Qualify and Play Up are both complete for this month."
                        : qualifiesNow
                          ? "Qualify is already complete. Focus now on reaching the Play Up requirement for the additional 75,000 BPP."
                          : `${belowRvp ? "satisfy the personal requirement, " : ""}Qualify at your current level, then push through the Play Up requirement for the second 75,000 BPP.`
                      : qualifiesNow
                        ? "Qualify is already complete for this month."
                        : `${belowRvp ? "satisfy the personal requirement, then " : ""}Qualify at your current level.`}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Strategy 2</p>
                        <h3 className="mt-1 text-lg font-bold text-[#17393a]">Licensing Focus</h3>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1a7f86]">High Leverage</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Build around people already moving toward licensing. Each qualifying life, securities/exam, or mortgage license can add 30,000 BPP.
                    </p>
                    <p className="mt-4 text-sm font-bold text-[#17393a]">
                      {gapToTarget === 0
                        ? "You are already at or above the current coaching target."
                        : `${whole.format(licensesToTarget)} qualifying license${licensesToTarget === 1 ? "" : "s"} = +${whole.format(licensesToTarget * 30000)} BPP toward the current coaching target.`}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Strategy 3</p>
                        <h3 className="mt-1 text-lg font-bold text-[#17393a]">Balanced Production</h3>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1a7f86]">Flexible</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Combine recruits, premium, licenses, initial trades, securities production, and mortgage production to close the remaining BPP gap.
                    </p>
                    <p className="mt-4 text-sm font-bold text-[#17393a]">Best when the opportunity is spread across several parts of the business.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d8c59c] bg-[#fffaf0] p-4 text-xs leading-5 text-[#785f32]">
                  Recommended strategies are coaching ideas based on the BPP rules. They are not guarantees of qualification. Official credit, rankings, minimums, and trip awards are determined by Primerica.
                </div>
              </div>
            ) : (
              <div className="mt-8">
                <div className="rounded-[24px] border border-[#b9d9d8] bg-[#f0f9f8] p-5">
                  <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Strategy Name</span>
                      <input
                        value={strategyName}
                        onChange={(event) => setStrategyName(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#1a7f86] focus:ring-4 focus:ring-[#1a7f86]/10"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Coach Notes</span>
                      <input
                        value={coachNotes}
                        onChange={(event) => setCoachNotes(event.target.value)}
                        placeholder="Example: Focus on 3 pending licenses, then push for Play Up."
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#1a7f86] focus:ring-4 focus:ring-[#1a7f86]/10"
                      />
                    </label>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    Build any strategy you want. Use the inputs below to model ideas such as getting 3 people licensed this month, Qualifying, Playing Up, adding premium, or combining several activities.
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-[#edf8f6] px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1a7f86]">{strategyName || "Custom Coach Strategy"}</p>
                    <p className="mt-1 text-xs text-slate-500">{coachNotes || "Adjust the activity below and watch the projection change."}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1a7f86]">Strategy Adds</p>
                    <p className="mt-1 text-xl font-bold text-[#17393a]">+{whole.format(strategyBpp)} BPP</p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Add activity to the strategy
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["qualifies", "Qualify at Level"],
                      ["playUps", "Play Up"],
                      ["lifeLicenses", "Life License"],
                      ["securitiesLicenses", "Securities License / Exam"],
                      ["mortgageLicenses", "Mortgage License"],
                      ["recruits", "Recruit"],
                      ["premium", "Life Premium"],
                      ["initialTrades", "Initial Trade"],
                      ["securitiesProduction", "Securities Production"],
                      ["mortgageProduction", "Mortgage Production"],
                    ].map(([field, label]) => {
                      const key = field as keyof Strategy;
                      const active = visibleStrategyFields.includes(key);

                      return (
                        <button
                          key={field}
                          type="button"
                          onClick={() => toggleStrategyField(key)}
                          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                            active
                              ? "border-[#17393a] bg-[#17393a] text-white"
                              : "border-slate-200 bg-white text-[#17393a] hover:border-[#1a7f86]"
                          }`}
                        >
                          {active ? "Remove " : "Add "}{label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {visibleStrategyFields.length > 0 ? (
                  <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleStrategyFields.includes("qualifies") ? <Field label="Qualify at Level" value={strategy.qualifies} onChange={(v) => update("qualifies", v)} hint={`${whole.format(bppRules.qualify)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("playUps") ? <Field label="Monthly Play Ups" value={strategy.playUps} onChange={(v) => update("playUps", v)} hint={`${whole.format(bppRules.playUp)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("lifeLicenses") ? <Field label="Life Licenses" value={strategy.lifeLicenses} onChange={(v) => update("lifeLicenses", v)} hint={`${whole.format(bppRules.lifeLicense)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("securitiesLicenses") ? <Field label="Securities Licenses / Exams" value={strategy.securitiesLicenses} onChange={(v) => update("securitiesLicenses", v)} hint={`${whole.format(bppRules.securitiesLicense)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("mortgageLicenses") ? <Field label="Mortgage Licenses" value={strategy.mortgageLicenses} onChange={(v) => update("mortgageLicenses", v)} hint={`${whole.format(bppRules.mortgageLicense)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("recruits") ? <Field label="Recruits" value={strategy.recruits} onChange={(v) => update("recruits", v)} hint={`${whole.format(bppRules.recruit)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("premium") ? <Field label="Life Premium" value={strategy.premium} onChange={(v) => update("premium", v)} hint="Dollar-for-dollar BPP; official per-sale caps still apply." /> : null}
                    {visibleStrategyFields.includes("initialTrades") ? <Field label="Initial Securities Trades" value={strategy.initialTrades} onChange={(v) => update("initialTrades", v)} hint={`${whole.format(bppRules.initialTrade)} BPP each`} /> : null}
                    {visibleStrategyFields.includes("securitiesProduction") ? <Field label="Securities Production" value={strategy.securitiesProduction} onChange={(v) => update("securitiesProduction", v)} hint={`${precise.format(bppRules.securitiesProductionPercent)}% counts toward BPP`} /> : null}
                    {visibleStrategyFields.includes("mortgageProduction") ? <Field label="Mortgage Production" value={strategy.mortgageProduction} onChange={(v) => update("mortgageProduction", v)} hint={`${precise.format(bppRules.mortgageProductionPercent)}% counts toward BPP`} /> : null}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center">
                    <p className="font-bold text-[#17393a]">No activity added yet</p>
                    <p className="mt-1 text-sm text-slate-500">Choose an activity above to begin building the coaching plan.</p>
                  </div>
                )}

                <div className="mt-8 rounded-[24px] bg-[#17393a] p-5 text-white">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e2c88e]">Your Coaching Plan</p>
                      <h3 className="mt-1 text-xl font-bold">{strategyName || "Coach's Custom Strategy"}</h3>
                    </div>
                    <Status
                      ok={winningLine > 0 && projectedBpp >= coachingTarget}
                      okLabel="On Target"
                      badLabel={winningLine > 0 ? "More Activity Needed" : "Enter Winning Line"}
                    />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    {[
                      ["Current Gap", winningLine > 0 ? `${whole.format(gapToLine)} BPP` : "Not calculated"],
                      ["Safety Cushion", `+${whole.format(safetyMargin)} BPP`],
                      ["Target to Close", winningLine > 0 ? `${whole.format(gapToTarget)} BPP` : "Not calculated"],
                      ["Strategy Adds", `+${whole.format(strategyBpp)} BPP`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/10 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">{label}</p>
                        <p className="mt-1 font-bold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm font-semibold text-white/85">
                    {winningLine <= 0
                      ? "Enter the current winning line to measure this plan."
                      : projectedBpp >= coachingTarget
                        ? `Projected position: ${whole.format(projectedBpp - winningLine)} BPP above today's winning line.`
                        : `Add ${whole.format(projectedTargetGap)} more BPP to reach the recommended safety target.`}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-5">
                    <p className="text-xs font-semibold text-slate-500">Projected BPP</p>
                    <p className="mt-2 text-2xl font-bold text-[#17393a]">{whole.format(projectedBpp)}</p>
                  </div>
                  <div className={`rounded-2xl p-5 ${projectedBpp >= winningLine ? "bg-emerald-50" : "bg-rose-50"}`}>
                    <p className="text-xs font-semibold text-slate-500">Current Winning Line</p>
                    <p className={`mt-2 text-lg font-bold ${projectedBpp >= winningLine ? "text-emerald-700" : "text-rose-700"}`}>
                      {projectedBpp >= winningLine ? `Above by ${whole.format(projectedBpp - winningLine)}` : `Short by ${whole.format(winningLine - projectedBpp)}`}
                    </p>
                  </div>
                  <div className={`rounded-2xl p-5 ${projectedBpp >= coachingTarget ? "bg-emerald-50" : "bg-[#fff8e8]"}`}>
                    <p className="text-xs font-semibold text-slate-500">Recommended Safety Target</p>
                    <p className="mt-1 text-sm font-bold text-[#17393a]">
                      {whole.format(coachingTarget)} BPP
                    </p>
                    <p className={`mt-2 text-lg font-bold ${projectedBpp >= coachingTarget ? "text-emerald-700" : "text-[#9a7639]"}`}>
                      {projectedBpp >= coachingTarget
                        ? `${whole.format(projectedBpp - coachingTarget)} above the 100K cushion`
                        : `${whole.format(projectedTargetGap)} more for a 100K cushion`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-[#d8c59c] bg-[#fffaf0] p-4 text-xs leading-5 text-[#785f32]">
                  <p className="font-bold text-[#17393a]">Why aim higher?</p>
                  <p className="mt-1">
                    The winning line can move as other competitors add BPP. The Recommended Safety Target adds a 100,000 BPP cushion above today&apos;s winning line so you are not coaching someone to the line itself.
                  </p>
                  <p className="mt-2">
                    This is a coaching recommendation only. Official competition credit, rankings, qualification status, and trip awards are determined by Primerica under the applicable rules.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <details className="rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b18745]">Reference</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-[#17393a]">View BPP Rules &amp; Calculations</h2>
              <span className="text-sm font-bold text-slate-400">Show</span>
            </div>
          </summary>

          <div className="grid gap-3 border-t border-slate-200 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-5">
            {[
              ["Recruit", `${whole.format(bppRules.recruit)} BPP`],
              ["Life License", `${whole.format(bppRules.lifeLicense)} BPP`],
              ["Qualify", `${whole.format(bppRules.qualify)} BPP`],
              ["Play Up", `${whole.format(bppRules.playUp)} BPP`],
              ["Premium", `${precise.format(bppRules.premiumMultiplier)} BPP / $1`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-bold text-[#17393a]">{value}</p>
              </div>
            ))}
          </div>
        </details>
        </div>
      </div>
      </div>

      <section className="print-only bg-white text-slate-900">
        <div className="print-page mx-auto max-w-[7.6in]">
          <header className="border-b-2 border-[#17393a] pb-3">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#9a7639]">
                  Trip Strategy Coach
                </p>
                <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em] text-[#17393a]">
                  Coaching Action Plan
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {tripName} — {tripSubtitle}
                </p>
              </div>
              <div className="text-right text-[10px] leading-5 text-slate-500">
                <p>{selectedTrack.qualificationLabel}</p>
                <p>Generated {generatedDate}</p>
              </div>
            </div>
          </header>

          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {[
              ["Name", coachName || "Teammate"],
              ["Level", levelRule.label],
              ["Category", selectedCategory.label],
              ["Winning Slots", selectedCategory.slotsLabel],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {label}
                </p>
                <p className="mt-1 text-xs font-bold leading-4 text-[#17393a]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <section className="mt-3 rounded-2xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b18745]">
              Where I Am
            </p>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {[
                ["Current BPP", whole.format(currentBpp)],
                ["Current Rank", `#${whole.format(rank)}`],
                ["Winning Line", whole.format(winningLine)],
                [
                  "Position",
                  gapToLine > 0
                    ? `${whole.format(gapToLine)} below`
                    : `${whole.format(currentBpp - winningLine)} above`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-2.5">
                  <p className="text-[9px] font-semibold text-slate-500">{label}</p>
                  <p className="mt-1 text-base font-bold text-[#17393a]">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-2 text-[10px]">
              <div className="rounded-lg border border-slate-200 p-2">
                <span className="font-bold">Recruits:</span> {monthlyRecruits}
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <span className="font-bold">Premium:</span> ${whole.format(monthlyPremium)}
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <span className="font-bold">Direct:</span> {directRecruits}
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <span className="font-bold">Personal Premium:</span> ${whole.format(personalPremium)}
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-[#e4c477] bg-[#fffaf0] p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a7639]">
              Where I&apos;m Falling Short
            </p>

            {printShortfalls.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[10.5px] leading-4 text-slate-700">
                {printShortfalls.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="font-bold text-[#b18745]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] font-semibold text-emerald-700">
                Current tracked qualification requirements are met.
              </p>
            )}
          </section>

          <section className="mt-3 rounded-2xl bg-[#17393a] p-3 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e2c88e]">
                  What I Need to Do
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {strategyMode === "coach"
                    ? strategyName || "Coach's Custom Strategy"
                    : playUpAvailable
                      ? playsUpNow
                        ? "Build the Remaining BPP Gap"
                        : qualifiesNow
                          ? "Play Up"
                          : "Qualify + Play Up"
                      : qualifiesNow
                        ? "Build the Remaining BPP Gap"
                        : "Qualify at Your Level"}
                </h2>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2 text-right">
                <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/60">
                  Projected Add
                </p>
                <p className="mt-1 text-lg font-bold">
                  +{whole.format(strategyMode === "coach" ? strategyBpp : qualifyPlayUpPotential)} BPP
                </p>
              </div>
            </div>

            {strategyMode === "coach" ? (
              <div className="mt-3">
                {coachNotes ? (
                  <p className="mb-2 text-[10px] leading-4 text-white/75">{coachNotes}</p>
                ) : null}
                {coachModeActions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] leading-4">
                    {coachModeActions.map((action) => (
                      <div key={action}>• {action}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/75">
                    Add activity in Coach Mode before printing this plan.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-1.5 text-[10.5px] leading-4 text-white/85">
                {belowRvp && (personalDirectNeed > 0 || personalPremiumNeed > 0) ? (
                  <p>
                    <strong className="text-white">1.</strong> Finish the personal requirement:
                    {" "}{whole.format(personalDirectNeed)} direct recruit{personalDirectNeed === 1 ? "" : "s"}
                    {" "}and ${whole.format(personalPremiumNeed)} personal premium.
                  </p>
                ) : null}

                {!qualifiesNow ? (
                  <p>
                    <strong className="text-white">2.</strong> Qualify at {levelRule.label}:
                    {" "}add {whole.format(qualifyRecruitNeed)} recruit{qualifyRecruitNeed === 1 ? "" : "s"}
                    {" "}and ${whole.format(qualifyPremiumNeed)} premium.
                  </p>
                ) : null}

                {playUpAvailable && !playsUpNow ? (
                  <p>
                    <strong className="text-white">{qualifiesNow ? "1." : "3."}</strong> Reach Play Up:
                    {" "}add {whole.format(playUpRecruitNeed)} recruit{playUpRecruitNeed === 1 ? "" : "s"}
                    {" "}and ${whole.format(playUpPremiumNeed)} premium for the additional {whole.format(bppRules.playUp)} BPP.
                  </p>
                ) : null}

                {gapToTarget > 0 ? (
                  <p>
                    <strong className="text-white">Supporting option:</strong>{" "}
                    {whole.format(licensesToTarget)} life license{licensesToTarget === 1 ? "" : "s"} at the current default value would add approximately{" "}
                    {whole.format(licensesToTarget * bppRules.lifeLicense)} BPP toward the coaching target.
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/15 pt-2">
              <div>
                <p className="text-[8px] uppercase tracking-[0.12em] text-white/50">Current BPP</p>
                <p className="mt-1 text-sm font-bold">{whole.format(currentBpp)}</p>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-[0.12em] text-white/50">Winning Line</p>
                <p className="mt-1 text-sm font-bold">{whole.format(winningLine)}</p>
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-[0.12em] text-white/50">Recommended Safety Target</p>
                <p className="mt-1 text-sm font-bold">{whole.format(coachingTarget)}</p>
              </div>
            </div>
          </section>

          <footer className="mt-3 border-t border-slate-200 pt-2 text-[8px] leading-3.5 text-slate-500">
            This coaching action plan is a planning estimate only. Official competition credit, qualification status,
            rankings, minimums, and trip awards are determined by Primerica under the applicable rules.
          </footer>
        </div>
      </section>
    </main>
  );
}

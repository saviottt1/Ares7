-- ============================================================
-- Migration 001: Initial Schema — ARES-7 Redline Outpost
-- Run: paste into Supabase SQL editor, or use `supabase db push`
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT NOT NULL DEFAULT 'Astronaut',
  avatar_url      TEXT,
  total_missions  INTEGER NOT NULL DEFAULT 0,
  total_score     INTEGER NOT NULL DEFAULT 0,
  best_stars      SMALLINT NOT NULL DEFAULT 0 CHECK (best_stars BETWEEN 0 AND 3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_total_score_idx ON public.profiles (total_score DESC, best_stars DESC);

-- Auto-create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', 'Astronaut'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Increment profile totals after a mission is saved (called by Edge Function or client RPC)
CREATE OR REPLACE FUNCTION public.increment_profile_totals(
  p_user_id UUID,
  p_stars    SMALLINT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, total_missions, total_score, best_stars)
  VALUES (p_user_id, 1, p_stars::INTEGER, p_stars)
  ON CONFLICT (id) DO UPDATE SET
    total_missions = profiles.total_missions + 1,
    total_score    = profiles.total_score + p_stars,
    best_stars     = GREATEST(profiles.best_stars, EXCLUDED.best_stars);
END;
$$;

-- ── missions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id            TEXT NOT NULL,
  mission_mode          TEXT NOT NULL CHECK (mission_mode IN ('campaign', 'practice')),
  mission_seed          TEXT NOT NULL,
  landing_site          TEXT NOT NULL,
  total_sols            SMALLINT NOT NULL DEFAULT 7,
  final_crew_health     NUMERIC(6,2) NOT NULL,
  final_food            NUMERIC(6,2) NOT NULL,
  final_oxygen_water    NUMERIC(6,2) NOT NULL,
  cumulative_radiation  NUMERIC(8,4) NOT NULL,
  remaining_battery     INTEGER NOT NULL,
  final_score           INTEGER NOT NULL DEFAULT 0,
  stars                 SMALLINT NOT NULL DEFAULT 1 CHECK (stars BETWEEN 1 AND 3),
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS missions_user_id_idx         ON public.missions (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS missions_session_id_idx      ON public.missions (session_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS missions_stars_idx           ON public.missions (stars DESC, completed_at DESC);

-- ── mission_sols ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_sols (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id                UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  sol_number                SMALLINT NOT NULL CHECK (sol_number BETWEEN 1 AND 7),
  shield_comms_allocation   INTEGER NOT NULL,
  bio_dome_allocation       INTEGER NOT NULL,
  habitat_allocation        INTEGER NOT NULL,
  available_power           INTEGER NOT NULL,
  radiation_level           NUMERIC(8,4) NOT NULL,
  crew_health               NUMERIC(6,2) NOT NULL,
  food_level                NUMERIC(6,2) NOT NULL,
  oxygen_water_level        NUMERIC(6,2) NOT NULL,
  battery_level             INTEGER NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_sols_mission_id_idx ON public.mission_sols (mission_id, sol_number);

-- ── nasa_space_weather ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nasa_space_weather (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT NOT NULL UNIQUE,  -- NASA DONKI flrID / sepID / activityID
  event_type        TEXT NOT NULL CHECK (event_type IN ('FLR', 'SEP', 'CME')),
  event_class       TEXT,
  event_start_time  TIMESTAMPTZ,
  event_peak_time   TIMESTAMPTZ,
  event_end_time    TIMESTAMPTZ,
  source_location   TEXT,
  raw_data          JSONB,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nasa_sw_type_idx       ON public.nasa_space_weather (event_type, event_start_time DESC);
CREATE INDEX IF NOT EXISTS nasa_sw_fetched_idx    ON public.nasa_space_weather (fetched_at DESC);

-- ── mission_events ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mission_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  sol_number       SMALLINT NOT NULL,
  event_type       TEXT NOT NULL,
  event_description TEXT NOT NULL,
  nasa_event_id    TEXT,  -- nullable foreign ref to nasa_space_weather.external_event_id
  severity         TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_events_mission_id_idx ON public.mission_events (mission_id, sol_number);

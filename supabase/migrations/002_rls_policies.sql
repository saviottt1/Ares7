-- ============================================================
-- Migration 002: Row Level Security Policies — ARES-7
-- Run after 001_initial_schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_sols     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nasa_space_weather ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_events   ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────
-- Users can read their own profile
CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (not id or created_at)
CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Leaderboard: anyone (including anon) can read the public fields of all profiles
-- (username, avatar_url, best_stars, total_missions, total_score — not PII)
CREATE POLICY "profiles: leaderboard read"
  ON public.profiles FOR SELECT
  USING (true);  -- All profile rows are readable; PII columns (email etc.) are not stored here

-- ── missions ─────────────────────────────────────────────────
-- Authenticated users: insert their own missions
CREATE POLICY "missions: authenticated insert"
  ON public.missions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Authenticated users: read their own missions
CREATE POLICY "missions: own read"
  ON public.missions FOR SELECT
  USING (auth.uid() = user_id);

-- Guest sessions: insert with null user_id (using session_id for filtering)
CREATE POLICY "missions: guest insert"
  ON public.missions FOR INSERT
  WITH CHECK (user_id IS NULL);

-- Guest sessions: read by session_id match (clients filter by session_id themselves;
-- RLS cannot verify sessionStorage values server-side, so guests rely on the client filter)
CREATE POLICY "missions: guest read"
  ON public.missions FOR SELECT
  USING (user_id IS NULL);

-- ── mission_sols ─────────────────────────────────────────────
-- Users can insert Sol rows that belong to their missions
CREATE POLICY "mission_sols: insert via mission"
  ON public.mission_sols FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id
        AND (m.user_id = auth.uid() OR m.user_id IS NULL)
    )
  );

-- Users can read Sol rows of their own missions
CREATE POLICY "mission_sols: read via mission"
  ON public.mission_sols FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id
        AND (m.user_id = auth.uid() OR m.user_id IS NULL)
    )
  );

-- ── nasa_space_weather ───────────────────────────────────────
-- Anyone (authenticated + anon) can read NASA event data
CREATE POLICY "nasa_sw: public read"
  ON public.nasa_space_weather FOR SELECT
  USING (true);

-- Only service_role (Edge Functions) can write NASA events
-- (anon and authenticated users cannot insert/update/delete)
CREATE POLICY "nasa_sw: service insert"
  ON public.nasa_space_weather FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "nasa_sw: service update"
  ON public.nasa_space_weather FOR UPDATE
  USING (auth.role() = 'service_role');

-- ── mission_events ───────────────────────────────────────────
CREATE POLICY "mission_events: insert via mission"
  ON public.mission_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id
        AND (m.user_id = auth.uid() OR m.user_id IS NULL)
    )
  );

CREATE POLICY "mission_events: read via mission"
  ON public.mission_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_id
        AND (m.user_id = auth.uid() OR m.user_id IS NULL)
    )
  );

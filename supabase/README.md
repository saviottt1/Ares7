# Supabase Setup — ARES-7 Redline Outpost

The game works without Supabase (offline mode, localStorage only).  
Adding Supabase enables: **mission history**, **global leaderboard**, **authenticated profiles**, and the **secure NASA API proxy**.

---

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Create a new project. Note the **Project URL** and **anon (public) key** from  
   **Project Settings → API**.

---

## 2. Run the Database Migrations

Paste the following SQL files into the **Supabase SQL Editor** (in order):

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
```

Or, if you have the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates 5 tables:

| Table | Purpose |
|---|---|
| `profiles` | Player usernames, avatars, scores |
| `missions` | Completed mission summaries |
| `mission_sols` | Per-Sol allocation and state data |
| `nasa_space_weather` | Cached NASA DONKI event records |
| `mission_events` | In-mission event log |

---

## 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
VITE_NASA_API_KEY=DEMO_KEY   # keep as DEMO_KEY unless using the Edge Function proxy
```

> **Security:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are the **public anon keys** — safe to include in the client bundle. Row Level Security (RLS) policies protect your data.

---

## 4. Deploy the NASA Space-Weather Edge Function

The Edge Function keeps your private NASA API key **server-side** — it never reaches the browser.

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref <your-project-ref>

# Deploy the function
supabase functions deploy nasa-space-weather

# Store your private NASA API key as a secret
supabase secrets set NASA_API_KEY=your_actual_nasa_key_here
```

Get a free NASA API key at [https://api.nasa.gov/](https://api.nasa.gov/).

After deployment, the Edge Function URL is:
```
https://<your-project>.supabase.co/functions/v1/nasa-space-weather
```

---

## 5. GitHub Actions Deployment

Add Supabase public keys as **GitHub Actions Variables** (not Secrets — they are public):

1. Go to your GitHub repo → **Settings → Secrets and variables → Actions → Variables**
2. Add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

The deploy workflow (`deploy.yml`) will inject these into the Vite build automatically.

---

## 6. Enable OAuth (Optional)

To allow players to sign in with GitHub or Google:

1. Go to **Supabase Dashboard → Authentication → Providers**
2. Enable **GitHub** and/or **Google**
3. Add your OAuth app credentials
4. Set the redirect URL to your GitHub Pages URL

---

## Security Notes

| Item | Location | Access |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env`, GitHub Variables | Public ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env`, GitHub Variables | Public ✅ |
| `NASA_API_KEY` | Supabase Edge Function secret | Server only 🔒 |
| `SUPABASE_SERVICE_ROLE_KEY` | Managed by Supabase | Edge Functions only 🔒 |

**Never commit a real private key to git.** The `.gitignore` excludes `.env`.

---

## Attribution

> ARES-7 is an independent educational simulation.  
> NASA does not endorse this application.  
> Data sourced from [NASA DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) and [NASA OSDR](https://osdr.nasa.gov/).

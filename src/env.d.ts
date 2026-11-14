/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL — public, safe to expose in browser */
  readonly VITE_SUPABASE_URL: string
  /** Supabase anon (publishable) key — public, safe to expose in browser */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /**
   * NASA API key — ONLY for DEMO_KEY (intentionally public) or local dev fallback.
   * A private NASA key MUST be stored in the Supabase Edge Function secret NASA_API_KEY,
   * never in this variable. Never commit a real key here.
   */
  readonly VITE_NASA_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Manus-tuning adapter types (existing — do not remove)
declare module 'manus-tuning/adapter.js' {
  export function outpostTuningPlugin(): import('vite').Plugin
}
declare module '*/manus-tuning/vite.mjs' {
  export function manusGameTuning(): import('vite').Plugin
}

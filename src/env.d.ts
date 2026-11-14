/// <reference types="vite/client" />

declare module '../scripts/manus-tuning/adapter.js' {
  export function registerGameTuning(
    store: { controls: readonly any[]; read(): any; apply(patch: unknown): void },
    scope?: any
  ): Promise<() => void>
}

declare module './scripts/manus-tuning/vite.mjs' {
  import type { Plugin } from 'vite'
  export function manusGameTuning(): Plugin
  export default manusGameTuning
}

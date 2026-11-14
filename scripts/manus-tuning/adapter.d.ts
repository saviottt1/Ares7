export declare function registerGameTuning(
  store: { controls: readonly any[]; read(): any; apply(patch: unknown): void },
  scope?: any
): Promise<() => void>

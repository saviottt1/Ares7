import { CONFIG, DEFAULT_CONFIG } from './config'

const controls = Object.freeze([
  { id: 'outpost.walkSpeed', type: 'number' as const, category: 'Outpost movement', label: 'Astronaut walk speed', description: 'Live speed of the procedural astronaut on the pad.', unit: 'm/s', default: DEFAULT_CONFIG.outpost.walkSpeed, min: 2, max: 6, step: 0.5, applyMode: 'LIVE' as const, integrity: 'COSMETIC' as const },
  { id: 'outpost.cameraSpan', type: 'number' as const, category: 'Outpost view', label: 'Orthographic view span', description: 'Live zoom framing of the Mars outpost scene.', unit: 'world units', default: DEFAULT_CONFIG.outpost.cameraSpan, min: 7, max: 12, step: 0.5, applyMode: 'LIVE' as const, integrity: 'COSMETIC' as const },
])
let requested: Record<string, number> = Object.fromEntries(controls.map(item => [item.id, item.default]))
export const outpostTuning = {
  get unranked(): boolean { return false },
  controls,
  read() { return { requested: { ...requested }, active: { 'outpost.walkSpeed': CONFIG.outpost.walkSpeed, 'outpost.cameraSpan': CONFIG.outpost.cameraSpan } } },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    const next = { ...requested }
    for (const [id, value] of entries) {
      const item = controls.find(control => control.id === id)
      if (!item || typeof value !== 'number' || !Number.isFinite(value) || value < item.min || value > item.max || Math.abs((value - item.min) / item.step - Math.round((value - item.min) / item.step)) > 1e-7) throw new Error('Invalid outpost value')
      next[id] = value
    }
    requested = next
    CONFIG.outpost.walkSpeed = requested['outpost.walkSpeed']
    CONFIG.outpost.cameraSpan = requested['outpost.cameraSpan']
  },
  activate(_boundary: 'run'): void {},
}

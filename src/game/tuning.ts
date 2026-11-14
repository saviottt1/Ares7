import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_RUN'
type Binding = { id: string; label: string; category: string; description: string; unit: string; default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY'; read(): number; write(value: number): void }
const bindings: Binding[] = [
  { id: 'player.walkSpeed', label: 'Astronaut walk speed', category: 'Movement', description: 'Updates the procedural astronaut speed in the outpost view.', unit: 'm/s', default: 4, min: 2, max: 6, step: 0.5, applyMode: 'LIVE', integrity: 'COSMETIC', read: () => CONFIG.player.walkSpeed, write: value => { CONFIG.player.walkSpeed = value } },
  { id: 'camera.distance', label: 'Outpost view scale', category: 'Camera', description: 'Updates the orthographic camera span in the outpost view.', unit: 'units', default: 9, min: 7, max: 12, step: 0.5, applyMode: 'LIVE', integrity: 'COSMETIC', read: () => CONFIG.camera.distance, write: value => { CONFIG.camera.distance = value } },
]
let requested = Object.fromEntries(bindings.map(item => [item.id, item.default]))
let unranked = false
export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(({ id, label, category, description, unit, default: value, min, max, step, applyMode, integrity }) => ({ id, type: 'number' as const, label, category, description, unit, default: value, min, max, step, applyMode, integrity }))),
  read() { return { requested: { ...requested }, active: Object.fromEntries(bindings.map(item => [item.id, item.read()])) } },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const item = bindings.find(binding => binding.id === id)
      if (!item || typeof value !== 'number' || !Number.isFinite(value) || value < item.min || value > item.max || Math.abs((value - item.min) / item.step - Math.round((value - item.min) / item.step)) > 1e-7) throw new Error('Invalid value')
    }
    requested = { ...requested, ...Object.fromEntries(entries) }
    for (const [id, value] of entries) bindings.find(item => item.id === id)!.write(value as number)
    unranked ||= entries.some(([id, value]) => bindings.find(item => item.id === id)!.integrity === 'GAMEPLAY' && value !== bindings.find(item => item.id === id)!.default)
  },
  activate(_boundary: 'run'): void { unranked = false },
}
void DEFAULT_CONFIG

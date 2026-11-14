import { NASA_DATA, type ProvenanceRecord } from '../data/nasaData'
import { mulberry32 } from './rng'

export type SiteKey = 'jezero' | 'elysium'
export type FlareKey = 'QUIET' | 'MOD' | 'SEV' | 'EXT' | 'AFT'

export type Scenario = {
  sol: number
  supply: number
  event: string
  flareKey: FlareKey
  classType: string
  sep: number
  flareId: ProvenanceRecord<string | null>
  date: string | null
  teaching: string
  dust: boolean
}

const flare = (key: FlareKey) => NASA_DATA.flareCatalog[key]

/** The fixed seven-Sol schedule is shared by both landing-site selections. */
export const CAMPAIGN: Scenario[] = [
  { sol: 1, supply: 100, event: 'QUIET • galactic cosmic rays', flareKey: 'QUIET', classType: 'None', sep: 1, flareId: flare('QUIET').id, date: null, teaching: 'Try a balanced start. See how all three stations use power.', dust: false },
  { sol: 2, supply: 100, event: 'MOD • M8.7 flare', flareKey: 'MOD', classType: 'M8.7', sep: 3.8, flareId: flare('MOD').id, date: '2024-05-08 11:26 UTC', teaching: 'Boost shields before the flare. Leave power for the habitat.', dust: false },
  { sol: 3, supply: 75, event: 'QUIET • dust opacity τ > 1.8', flareKey: 'QUIET', classType: 'None', sep: 1, flareId: flare('QUIET').id, date: null, teaching: 'Dust dims the Sun. Save power or use the battery.', dust: true },
  { sol: 4, supply: 95, event: 'QUIET • wheat pollination', flareKey: 'QUIET', classType: 'None', sep: 1, flareId: flare('QUIET').id, date: null, teaching: 'Raise Bio-Dome power to test Sol 4 pollination.', dust: false },
  { sol: 5, supply: 65, event: 'QUIET • severe dust storm', flareKey: 'QUIET', classType: 'None', sep: 1, flareId: flare('QUIET').id, date: null, teaching: 'Choose what to protect during the severe dust storm.', dust: true },
  { sol: 6, supply: 100, event: 'SEV • X8.7 flare + CME', flareKey: 'SEV', classType: 'X8.7', sep: 7.5, flareId: flare('SEV').id, date: '2024-05-14 16:46 UTC', teaching: 'A strong flare is coming. Consider extra shield power.', dust: false },
  { sol: 7, supply: 90, event: 'AFT • X2.1 flare', flareKey: 'AFT', classType: 'X2.1', sep: 3, flareId: flare('AFT').id, date: '2024-10-07 19:02 UTC', teaching: 'Balance the last power plan against your total dose.', dust: false },
]

const RANDOM_SUPPLY = [100, 95, 90, 75, 65]
const RANDOM_FLARES: FlareKey[] = ['QUIET', 'MOD', 'SEV', 'EXT', 'AFT']

/** Seeded practice deck. Site B draws more dust by game-design choice only. */
export function randomizedMission(seed: number, site: SiteKey): Scenario[] {
  const random = mulberry32(seed)
  const result = Array.from({ length: 7 }, (_, index) => {
    const dustWeight = site === 'elysium' ? 0.5 : 0.28
    const dust = random() < dustWeight
    const supply = dust ? RANDOM_SUPPLY[3 + Math.floor(random() * 2)] : RANDOM_SUPPLY[Math.floor(random() * 3)]
    const flareKey = RANDOM_FLARES[Math.floor(random() * RANDOM_FLARES.length)]
    const record = flare(flareKey)
    return {
      ...CAMPAIGN[index],
      sol: index + 1,
      supply,
      event: flareKey === 'QUIET' ? (dust ? 'QUIET • dust front' : 'QUIET • baseline') : `${flareKey} • ${record.classType.value} flare`,
      flareKey,
      classType: record.classType.value,
      sep: record.sepMultiplier.value,
      flareId: record.id,
      date: record.beginTime.value,
      teaching: dust ? 'Dust is a game-designed supply challenge.' : 'Practice the same power trade-offs.',
      dust,
    }
  })
  if (!result.some(item => item.supply <= 75)) {
    const last = result[6]
    result[6] = { ...last, supply: 75, dust: true, event: last.flareKey === 'QUIET' ? 'QUIET • dust front' : `${last.flareKey} • ${last.classType} flare + dust front`, teaching: 'Dust is a game-designed supply challenge.' }
  }
  if (!result.some(item => item.sep >= 3.8)) {
    const choice = result[5].flareKey === 'QUIET' ? 5 : 4
    const key: FlareKey = 'MOD'
    result[choice] = { ...result[choice], flareKey: key, classType: flare(key).classType.value, sep: flare(key).sepMultiplier.value, flareId: flare(key).id, date: flare(key).beginTime.value, event: result[choice].dust ? 'MOD • M8.7 flare + dust front' : 'MOD • M8.7 flare' }
  }
  return result
}

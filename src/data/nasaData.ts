export type Provenance = 'REAL NASA MEASUREMENT' | 'SCALED PHYSICS MODEL' | 'NORMALIZED GAME UNIT'
export type ProvenanceRecord<T> = { value: T; unit: string; provenance: Provenance; source: string; url: string; verified: boolean }

const record = <T>(value: T, unit: string, provenance: Provenance, source: string, url: string, verified: boolean): ProvenanceRecord<T> =>
  ({ value, unit, provenance, source, url, verified })

export const NASA_DATA = {
  radiation: {
    marsSurface: record(0.64, 'mSv/day', 'REAL NASA MEASUREMENT', 'Curiosity RAD at Gale Crater; used as a shared reference, not a site-specific reading.', 'https://science.nasa.gov/mission/msl-curiosity/msl-instruments/radiation-assessment-detector-rad/', true),
    deepSpaceCruise: record(1.84, 'mSv/day', 'REAL NASA MEASUREMENT', 'Curiosity RAD cruise reference stated in ARES-7 v3.', 'https://science.nasa.gov/mission/msl-curiosity/msl-instruments/radiation-assessment-detector-rad/', true),
    safeBudget: record(6.5, 'mSv / 7 Sols', 'NORMALIZED GAME UNIT', 'ARES-7 v3 mission design budget; not a NASA safety limit.', 'https://science.nasa.gov/mission/msl-curiosity/msl-instruments/radiation-assessment-detector-rad/', true),
  },
  sites: {
    jezero: {
      name: 'Jezero Crater (Perseverance)',
      latitude: record(18.4447, '° N', 'REAL NASA MEASUREMENT', 'Landing-site coordinates listed in ARES-7 v3.', 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/', true),
      longitude: record(77.4508, '° E', 'REAL NASA MEASUREMENT', 'Landing-site coordinates listed in ARES-7 v3.', 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/', true),
      elevation: record(null, 'm (approx. −2.6 km; verify)', 'REAL NASA MEASUREMENT', 'Elevation is not verified in the supplied specification; no precise value shown.', 'https://trek.nasa.gov/mars/', false),
    },
    elysium: {
      name: 'Elysium Planitia (InSight)',
      latitude: record(4.5024, '° N', 'REAL NASA MEASUREMENT', 'Landing-site coordinates listed in ARES-7 v3.', 'https://science.nasa.gov/mission/insight/', true),
      longitude: record(135.6234, '° E', 'REAL NASA MEASUREMENT', 'Landing-site coordinates listed in ARES-7 v3.', 'https://science.nasa.gov/mission/insight/', true),
      elevation: record(-2613, 'm MOLA', 'REAL NASA MEASUREMENT', 'InSight site elevation listed in ARES-7 v3; direct Mars Trek data record not checked.', 'https://trek.nasa.gov/mars/', false),
    },
  },
  flareCatalog: {
    QUIET: {
      id: record<string | null>(null, 'NASA DONKI flrID', 'REAL NASA MEASUREMENT', 'Baseline is a local campaign label, not a DONKI event ID.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
      classType: record('None', 'class', 'REAL NASA MEASUREMENT', 'Quiet baseline, as specified for the campaign.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
      beginTime: record<string | null>(null, 'UTC', 'REAL NASA MEASUREMENT', 'No flare time for the quiet baseline.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
      sepMultiplier: record(1, '×', 'SCALED PHYSICS MODEL', 'Game-design baseline multiplier from ARES-7 v3.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
    },
    MOD: {
      id: record<string | null>('2024-05-08T11:26:00-FLR-001', 'NASA DONKI flrID', 'REAL NASA MEASUREMENT', 'ID listed in ARES-7 v3; not confirmed in DONKI.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      classType: record('M8.7', 'class', 'REAL NASA MEASUREMENT', 'May 8, 2024 flare class listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      beginTime: record<string | null>('2024-05-08 11:26 UTC', 'UTC', 'REAL NASA MEASUREMENT', 'Time listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      sepMultiplier: record(3.8, '×', 'SCALED PHYSICS MODEL', 'Game-design multiplier from ARES-7 v3; X-ray class does not determine proton dose.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
    },
    SEV: {
      id: record<string | null>('2024-05-14T16:46:00-FLR-001', 'NASA DONKI flrID', 'REAL NASA MEASUREMENT', 'ID listed in ARES-7 v3; not confirmed in DONKI.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      classType: record('X8.7', 'class', 'REAL NASA MEASUREMENT', 'May 14, 2024 flare class listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      beginTime: record<string | null>('2024-05-14 16:46 UTC', 'UTC', 'REAL NASA MEASUREMENT', 'Time listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      sepMultiplier: record(7.5, '×', 'SCALED PHYSICS MODEL', 'Game-design multiplier from ARES-7 v3; X-ray class does not determine proton dose.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
    },
    EXT: {
      id: record<string | null>('2024-10-03T12:08:00-FLR-001', 'NASA DONKI flrID', 'REAL NASA MEASUREMENT', 'ID listed in ARES-7 v3; not confirmed in DONKI.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      classType: record('X9.0', 'class', 'REAL NASA MEASUREMENT', 'October 3, 2024 flare class listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      beginTime: record<string | null>('2024-10-03 12:08 UTC', 'UTC', 'REAL NASA MEASUREMENT', 'Time listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      sepMultiplier: record(9.5, '×', 'SCALED PHYSICS MODEL', 'Game-design multiplier from ARES-7 v3; X-ray class does not determine proton dose.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
    },
    AFT: {
      id: record<string | null>('2024-10-07T19:02:00-FLR-001', 'NASA DONKI flrID', 'REAL NASA MEASUREMENT', 'ID listed in ARES-7 v3; not confirmed in DONKI.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      classType: record('X2.1', 'class', 'REAL NASA MEASUREMENT', 'October 7, 2024 flare class listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      beginTime: record<string | null>('2024-10-07 19:02 UTC', 'UTC', 'REAL NASA MEASUREMENT', 'Time listed in ARES-7 v3; exact DONKI identity pending.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', false),
      sepMultiplier: record(3, '×', 'SCALED PHYSICS MODEL', 'Game-design multiplier from ARES-7 v3; X-ray class does not determine proton dose.', 'https://ccmc.gsfc.nasa.gov/tools/DONKI/', true),
    },
  },
} as const

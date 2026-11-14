/**
 * NASA OSDR OSD-984 research data module.
 *
 * Data sourced from NASA Open Science Data Repository (OSDR).
 * Study: OSD-984 / GLDS-797
 * Title: "Low-dose Simulated Galactic Cosmic Radiation Exposure After Hindlimb
 *         Unloading Has Long-term Impact on Skeletal Muscle Metabolic Proteins"
 * DOI: 10.26030/wc0k-st23
 *
 * ⚠ SCIENTIFIC RESTRICTIONS — read before modifying:
 *   • This is a MOUSE GROUND-BASED study, not an astronaut clinical dataset.
 *   • Absorbed doses in Gy are experimental ground values, not astronaut effective doses in Sv.
 *   • The metadata does not contain protein abundance measurements.
 *     Do not add invented protein values.
 *   • Do not use these doses to modify the game's radiation budget (mSv).
 */

import rawData from './osdr984.json'

// Re-export the processed JSON with TypeScript types
export interface OsdrTreatmentGroup {
  code: string
  label: string
  hindlimbUnloading: string
  ionizingRadiation: string
  absorbedDoseGy: number
  sampleCount: number
  sampleIds: string[]
}

export interface OsdrStudy {
  identifier: string
  geneLabIdentifier: string
  title: string
  description: string
  doi: string
  publicationDoi: string
  publicationTitle: string
  publicationAuthors: string
  submissionDate: string
  publicReleaseDate: string
  osdrUrl: string
}

export interface OsdrData {
  _meta: {
    generatedAt: string
    sourceFiles: string[]
    provenance: string
    disclaimer: string
  }
  study: OsdrStudy
  organism: {
    species: string
    strain: string
    sex: string
    source: string
    ageAtIrradiation: string
    ageAtCollection: string
    recoveryPeriod: string
  }
  assay: {
    type: string
    technology: string
    platform: string
    tissue: string
    preparationFacility: string
    irradiationFacility: string
  }
  experiment: {
    radiationType: string
    radiationSimulationReference: string
    nsrlProtocolUrl: string
    totalBiologicalSamples: number
    pooledControlSamples: number
  }
  treatmentGroups: OsdrTreatmentGroup[]
}

export const OSDR_984: OsdrData = rawData as OsdrData

/**
 * Educational mission-to-research connection.
 * Explains how this mouse study informs the ARES-7 crew health training scenarios.
 * All text is clearly labelled as educational interpretation.
 */
export const RESEARCH_CONNECTIONS = [
  {
    topic: 'Galactic Cosmic Radiation (GCR)',
    researchContext:
      'The OSD-984 study used NASA\'s SimGCRSim protocol at the NASA Space Radiation Laboratory (NSRL) ' +
      'to simulate the mixed-field GCR environment astronauts encounter beyond Earth\'s magnetosphere.',
    missionRelevance:
      'In the ARES-7 game, the SEP radiation multiplier represents elevated space-weather particle flux. ' +
      'Real missions must account for both chronic GCR background and acute solar particle events.',
    provenance: 'NASA OSDR RESEARCH METADATA — MOUSE GROUND STUDY' as const,
    disclaimer:
      'The experimental doses (0.5–1.5 Gy) are ground-study values administered to mice. ' +
      'They are not interchangeable with the game\'s simplified mSv dose budget.',
  },
  {
    topic: 'Skeletal Muscle & Microgravity',
    researchContext:
      'Hindlimb unloading (HU) in rodents simulates the fluid shifts and muscle unloading of microgravity. ' +
      'The study examined gastrocnemius muscle proteins 9 months after recovery from combined HU and GCR exposure.',
    missionRelevance:
      'Long-duration missions require active countermeasures against muscle deconditioning. ' +
      'The Habitat & ECLSS station in ARES-7 represents the life-support systems that maintain crew readiness.',
    provenance: 'NASA OSDR RESEARCH METADATA — MOUSE GROUND STUDY' as const,
    disclaimer:
      'Crew Readiness in the game is a simplified educational indicator, not a clinical measurement.',
  },
  {
    topic: 'Combined Stressor Effects',
    researchContext:
      'OSD-984 investigated whether the combination of unloading and GCR radiation produces different ' +
      'long-term effects on skeletal muscle metabolic proteins than either stressor alone.',
    missionRelevance:
      'Spaceflight combines radiation, microgravity, isolation, and other stressors simultaneously. ' +
      'Understanding combined effects is critical for protecting crew health on multi-year Mars missions.',
    provenance: 'NASA OSDR RESEARCH METADATA — MOUSE GROUND STUDY' as const,
    disclaimer:
      'The specific protein-level findings require the full experimental dataset, not provided in the metadata alone.',
  },
  {
    topic: 'Long-term Recovery',
    researchContext:
      'Animals were observed for 9 months post-irradiation — equivalent to studying persistent effects ' +
      'long after a mission ends, relevant to astronaut longitudinal health monitoring.',
    missionRelevance:
      'Post-mission health monitoring is a key NASA priority. The ARES-7 seven-Sol campaign illustrates ' +
      'that decisions made early in a mission compound over time.',
    provenance: 'NASA OSDR RESEARCH METADATA — MOUSE GROUND STUDY' as const,
    disclaimer:
      'The seven-Sol mission timeline is a simplified educational abstraction.',
  },
] as const

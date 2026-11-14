#!/usr/bin/env node
/**
 * scripts/process-osdr984.mjs
 *
 * Preprocessor for NASA OSDR OSD-984 metadata files.
 * Reads the ISA-Tab files and emits src/data/osdr984.json.
 *
 * Run: node scripts/process-osdr984.mjs
 *
 * This script is for local/CI use only. The output JSON is committed to the
 * repository so users do not need the raw metadata files to run the app.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const METADATA_DIR = join(ROOT, 'OSD-984_metadata_OSD-984-ISA')

// ── Parse a simple tab-separated ISA-Tab key-value investigation file ────────
function parseInvestigation(text) {
  const result = {}
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    const key = line.slice(0, tab).trim()
    const value = line.slice(tab + 1).split('\t')[0].trim()
    if (key && value) result[key] = value
  }
  return result
}

// ── Parse a TSV with header row ───────────────────────────────────────────────
function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split('\t')
  return lines.slice(1).map(line => {
    const cells = line.split('\t')
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (cells[i] ?? '').trim() })
    return row
  })
}

function readFile(name) {
  return readFileSync(join(METADATA_DIR, name), 'utf8')
}

// ── Load files ────────────────────────────────────────────────────────────────
const inv = parseInvestigation(readFile('i_Investigation.txt'))
const sampleRows = parseTsv(readFile('s_OSD-984.txt'))

// ── Build treatment groups ────────────────────────────────────────────────────
const POOLED_PREFIX = 'Pooled'
const biologicalRows = sampleRows.filter(r => !r['Source Name'].startsWith(POOLED_PREFIX))
const pooledRows = sampleRows.filter(r => r['Source Name'].startsWith(POOLED_PREFIX))

const groupMap = new Map()
for (const row of biologicalRows) {
  const hu = row['Factor Value[Hindlimb Unloading]'] || 'Unknown'
  const rad = row['Factor Value[Ionizing Radiation]'] || 'Unknown'
  const doseStr = row['Factor Value[Absorbed Radiation Dose]']
  const dose = parseFloat(doseStr) || 0

  // Derive the canonical group code from the paper (WB0, HU0, WB0.5, HU0.5, HU1.5)
  const isHU = hu.includes('Hindlimb Unloaded')
  const prefix = isHU ? 'HU' : 'WB'
  const code = `${prefix}${dose}`
  const key = code

  if (!groupMap.has(key)) {
    groupMap.set(key, {
      code,
      label: isHU ? 'Hindlimb Unloaded' : 'Normally Loaded (Weight-bearing)',
      hindlimbUnloading: hu,
      ionizingRadiation: rad === 'sham-irradiated' ? 'Sham-irradiated (0 Gy)' : rad,
      absorbedDoseGy: dose,
      sampleCount: 0,
      sampleIds: [],
    })
  }
  const g = groupMap.get(key)
  g.sampleCount += 1
  g.sampleIds.push(row['Source Name'])
}

const treatmentGroups = Array.from(groupMap.values()).sort((a, b) =>
  a.absorbedDoseGy - b.absorbedDoseGy || a.code.localeCompare(b.code)
)

// ── Build output JSON ─────────────────────────────────────────────────────────
const output = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sourceFiles: [
      'OSD-984_metadata_OSD-984-ISA/i_Investigation.txt',
      'OSD-984_metadata_OSD-984-ISA/s_OSD-984.txt',
    ],
    provenance: 'NASA OSDR RESEARCH METADATA — MOUSE GROUND STUDY',
    disclaimer:
      'This is a mouse ground-based research study, not an astronaut clinical dataset. ' +
      'Absorbed doses in Gy are experimental values, not astronaut effective doses in Sv. ' +
      'No protein abundance data is included — the assay metadata describes experimental design only.',
  },
  study: {
    identifier: inv['Study Identifier'] || 'OSD-984',
    geneLabIdentifier: 'GLDS-797',
    title: inv['Study Title'] || '',
    description: inv['Study Description'] || '',
    doi: '10.26030/wc0k-st23',
    publicationDoi: inv['Study Publication DOI'] || '',
    publicationTitle: inv['Study Publication Title'] || '',
    publicationAuthors: inv['Study Publication Author List'] || '',
    submissionDate: inv['Study Submission Date'] || '',
    publicReleaseDate: inv['Study Public Release Date'] || '',
    osdrUrl: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-984',
  },
  organism: {
    species: 'Mus musculus',
    strain: 'C57BL/6J',
    sex: 'Female',
    source: 'Jackson Laboratory',
    ageAtIrradiation: '6 months',
    ageAtCollection: '15 months',
    recoveryPeriod: '9 months post-irradiation',
  },
  assay: {
    type: 'Protein expression profiling',
    technology: 'Mass spectrometry',
    platform: 'Orbitrap Exploris 480 (Thermo Fisher)',
    tissue: 'Left gastrocnemius (skeletal muscle)',
    preparationFacility: 'IDeA National Resource for Quantitative Proteomics, UAMS',
    irradiationFacility: 'NASA Space Radiation Laboratory (NSRL), Brookhaven National Laboratory',
  },
  experiment: {
    radiationType: 'SimGCRSim — Simplified Galactic Cosmic Ray Simulation',
    radiationSimulationReference: 'Simonsen LC, Slaba TC, Guida P, Rusek A (2020). PLoS Biol 18(5): e3000669. https://doi.org/10.1371/journal.pbio.3000669',
    nsrlProtocolUrl: 'https://www.bnl.gov/nsrl/userguide/simgcrsim.php',
    totalBiologicalSamples: biologicalRows.length,
    pooledControlSamples: pooledRows.length,
  },
  treatmentGroups,
}

const outPath = join(ROOT, 'src', 'data', 'osdr984.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))
console.log(`✓ Wrote ${outPath} (${treatmentGroups.length} treatment groups, ${biologicalRows.length} biological samples)`)

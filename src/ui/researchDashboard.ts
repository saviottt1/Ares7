/**
 * NASA Space Biology Research Dashboard.
 *
 * Renders into a <dialog>. Displays OSDR OSD-984 study metadata with
 * interactive group visualization and mission-connection education cards.
 *
 * All content is clearly labelled by provenance tier:
 *   "NASA OSDR RESEARCH METADATA"  — from the ISA-Tab files
 *   "EDUCATIONAL INTERPRETATION"   — explanatory text linking study to game
 *   "EDUCATIONAL SIMULATION"       — game mechanics only
 */

import { OSDR_984, RESEARCH_CONNECTIONS, type OsdrTreatmentGroup } from '../data/osdr984'

const escH = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

/** Assign a consistent color per treatment group */
function groupColor(code: string): string {
  if (code === 'WB0') return '#38bdf8'
  if (code === 'HU0') return '#818cf8'
  if (code === 'WB0.5') return '#fbbf24'
  if (code === 'HU0.5') return '#fb923c'
  if (code === 'HU1.5') return '#f87171'
  return '#94a3b8'
}

function renderGroupBar(group: OsdrTreatmentGroup, maxDose: number): string {
  const color = groupColor(group.code)
  const barWidth = group.absorbedDoseGy === 0
    ? 8
    : Math.round((group.absorbedDoseGy / maxDose) * 100)
  const doseLabel = group.absorbedDoseGy === 0
    ? 'Sham (0 Gy)'
    : `${group.absorbedDoseGy} Gy`
  return `
    <div class="osdr-group-row">
      <div class="osdr-group-info">
        <span class="osdr-group-code" style="color:${color}">${escH(group.code)}</span>
        <span class="osdr-group-label">${escH(group.label)}</span>
        <span class="osdr-group-n">n = ${escH(String(group.sampleCount))}</span>
      </div>
      <div class="osdr-bar-wrap">
        <div class="osdr-bar" style="width:${barWidth}%;background:${color}"></div>
        <span class="osdr-dose-label">${escH(doseLabel)}</span>
      </div>
      <div class="osdr-group-detail">
        <small>${escH(group.ionizingRadiation)}</small>
      </div>
    </div>`
}

function renderConnectionCard(conn: (typeof RESEARCH_CONNECTIONS)[number]): string {
  return `
    <div class="research-card">
      <h4>${escH(conn.topic)}</h4>
      <div class="research-card-body">
        <div class="research-card-section">
          <span class="rc-label nasa-label">NASA OSDR RESEARCH METADATA</span>
          <p>${escH(conn.researchContext)}</p>
        </div>
        <div class="research-card-section">
          <span class="rc-label edu-label">MISSION CONNECTION</span>
          <p>${escH(conn.missionRelevance)}</p>
        </div>
        <div class="research-card-disclaimer">
          <small>⚠ ${escH(conn.disclaimer)}</small>
        </div>
      </div>
    </div>`
}

export class ResearchDashboard {
  private dialog: HTMLDialogElement

  constructor(private root: HTMLElement) {
    this.dialog = this.createDialog()
    root.appendChild(this.dialog)
    this.dialog.addEventListener('close', () => {
      root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
    })
  }

  private createDialog(): HTMLDialogElement {
    const el = document.createElement('dialog')
    el.className = 'info-dialog research-dialog'
    el.setAttribute('aria-labelledby', 'research-title')
    const study = OSDR_984.study
    const org = OSDR_984.organism
    const assay = OSDR_984.assay
    const exp = OSDR_984.experiment
    const groups = OSDR_984.treatmentGroups
    const maxDose = Math.max(...groups.map(g => g.absorbedDoseGy))

    el.innerHTML = `
      <div class="dialog-panel">
        <div class="dialog-heading">
          <div>
            <span class="panel-kicker">NASA OSDR / SPACE BIOLOGY RESEARCH</span>
            <h2 id="research-title">NASA Space Biology Research</h2>
          </div>
          <button class="close-button" id="research-close" aria-label="Close research panel">×</button>
        </div>
        <div class="dialog-body research-body">

          <!-- Provenance Banner -->
          <div class="osdr-banner">
            <span class="sw-prov real">NASA OSDR RESEARCH DATA — MOUSE GROUND STUDY</span>
            <a href="${escH(study.osdrUrl)}" target="_blank" rel="noreferrer"
               class="osdr-link">View on NASA OSDR ↗</a>
          </div>

          <!-- Study overview -->
          <section class="osdr-section">
            <h3>Research Overview</h3>
            <dl class="osdr-dl two-col">
              <dt>Study Identifier</dt><dd>${escH(study.identifier)}</dd>
              <dt>GeneLab ID</dt><dd>${escH(study.geneLabIdentifier)}</dd>
              <dt>OSDR DOI</dt><dd><a href="https://doi.org/${escH(study.doi)}" target="_blank" rel="noreferrer">${escH(study.doi)}</a></dd>
              <dt>Publication DOI</dt><dd><a href="https://doi.org/${escH(study.publicationDoi)}" target="_blank" rel="noreferrer">${escH(study.publicationDoi)}</a></dd>
              <dt>Study title</dt><dd colspan="3"><em>${escH(study.title)}</em></dd>
              <dt>Description</dt><dd colspan="3">${escH(study.description)}</dd>
              <dt>Publication title</dt><dd colspan="3">${escH(study.publicationTitle)}</dd>
              <dt>Authors</dt><dd colspan="3">${escH(study.publicationAuthors)}</dd>
              <dt>Public release</dt><dd>${escH(study.publicReleaseDate)}</dd>
            </dl>
          </section>

          <!-- Organism & Assay -->
          <section class="osdr-section">
            <h3>Study Design</h3>
            <div class="osdr-two-col">
              <div>
                <h4>Organism</h4>
                <dl class="osdr-dl">
                  <dt>Species</dt><dd><em>${escH(org.species)}</em></dd>
                  <dt>Strain</dt><dd>${escH(org.strain)}</dd>
                  <dt>Sex</dt><dd>${escH(org.sex)}</dd>
                  <dt>Age at irradiation</dt><dd>${escH(org.ageAtIrradiation)}</dd>
                  <dt>Age at collection</dt><dd>${escH(org.ageAtCollection)}</dd>
                  <dt>Recovery period</dt><dd>${escH(org.recoveryPeriod)}</dd>
                </dl>
              </div>
              <div>
                <h4>Assay</h4>
                <dl class="osdr-dl">
                  <dt>Assay type</dt><dd>${escH(assay.type)}</dd>
                  <dt>Technology</dt><dd>${escH(assay.technology)}</dd>
                  <dt>Platform</dt><dd>${escH(assay.platform)}</dd>
                  <dt>Tissue</dt><dd>${escH(assay.tissue)}</dd>
                  <dt>Irradiation facility</dt><dd>${escH(assay.irradiationFacility)}</dd>
                </dl>
              </div>
            </div>
          </section>

          <!-- Treatment groups visualization -->
          <section class="osdr-section">
            <h3>Radiation Exposure Groups
              <span class="sw-count">${escH(String(exp.totalBiologicalSamples))} biological samples</span>
            </h3>
            <p class="osdr-viz-note">
              Radiation type: ${escH(exp.radiationType)} ·
              Facility: NASA Space Radiation Laboratory (NSRL), Brookhaven National Laboratory
            </p>
            <div class="osdr-groups">
              ${groups.map(g => renderGroupBar(g, maxDose)).join('')}
            </div>
            <div class="osdr-group-legend">
              <span style="color:#38bdf8">■ WB0</span> Weight-bearing, 0 Gy (sham) ·
              <span style="color:#818cf8">■ HU0</span> Hindlimb unloaded, 0 Gy ·
              <span style="color:#fbbf24">■ WB0.5</span> Weight-bearing, 0.5 Gy ·
              <span style="color:#fb923c">■ HU0.5</span> Hindlimb unloaded, 0.5 Gy ·
              <span style="color:#f87171">■ HU1.5</span> Hindlimb unloaded, 1.5 Gy
            </div>
            <div class="osdr-dose-disclaimer">
              <p>⚠ <strong>Scientific note:</strong> Absorbed doses in gray (Gy) are experimental ground-study values
              administered to mice. They are <strong>not</strong> interchangeable with astronaut effective dose in
              sievert (Sv) or the game's simplified mSv radiation budget. The 0.5 Gy and 1.5 Gy doses represent
              the SimGCRSim protocol; real deep-space missions accumulate approximately 0.3–0.6 Sv/year of
              effective dose equivalent from GCR at solar minimum.</p>
            </div>
          </section>

          <!-- Data provenance -->
          <section class="osdr-section">
            <h3>Data Availability</h3>
            <div class="osdr-availability">
              <div class="osdr-avail-item avail-yes">
                <span class="avail-icon">✓</span>
                <div>
                  <strong>ISA-Tab study metadata</strong>
                  <p>Investigation, sample, and assay metadata files from NASA OSDR.</p>
                  <span class="sw-prov real">NASA OSDR RESEARCH METADATA — verified</span>
                </div>
              </div>
              <div class="osdr-avail-item avail-pending">
                <span class="avail-icon">○</span>
                <div>
                  <strong>Protein abundance data</strong>
                  <p>Mass spectrometry quantitative results require download of the full OSDR dataset.
                     Not included in this application — no protein values are invented or estimated.</p>
                  <span class="sw-prov pending-label">Requires separate dataset download</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Mission connections -->
          <section class="osdr-section">
            <h3>Research-to-Mission Connections
              <span class="edu-label" style="font-size:11px;margin-left:8px">EDUCATIONAL INTERPRETATION</span>
            </h3>
            <p class="osdr-viz-note">
              The following explanations connect OSD-984 research themes to ARES-7 mission scenarios.
              These are educational interpretations, not direct scientific conclusions from the study.
            </p>
            <div class="research-cards">
              ${RESEARCH_CONNECTIONS.map(c => renderConnectionCard(c)).join('')}
            </div>
          </section>

          <!-- Attribution -->
          <section class="osdr-section osdr-attribution">
            <p>Data sourced from: <a href="${escH(study.osdrUrl)}" target="_blank" rel="noreferrer">NASA Open Science Data Repository — OSD-984</a></p>
            <p>ARES-7 is an independent educational simulation. NASA does not endorse this application.</p>
          </section>

        </div>
        <div class="dialog-footer">
          <span>Source: <a href="${escH(study.osdrUrl)}" target="_blank" rel="noreferrer">NASA OSDR OSD-984</a></span>
          <button class="secondary-button" id="research-close-btn">Close</button>
        </div>
      </div>`

    el.querySelector('#research-close')?.addEventListener('click', () => el.close())
    el.querySelector('#research-close-btn')?.addEventListener('click', () => el.close())
    return el
  }

  open(): void {
    this.dialog.showModal()
    this.root.dispatchEvent(new Event('mission-modal-change', { bubbles: true }))
  }
}

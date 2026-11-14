// End-to-end smoke test: build first (`pnpm build`). Serves dist/ and exercises the actual mission flow.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors, { disableWebgl = false } = {}) {
  const page = await context.newPage()
  await page.clock.install()
  if (disableWebgl) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).toLowerCase().startsWith('webgl')) return null
      return Reflect.apply(original, this, [type, ...args])
    }
  })
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (disableWebgl && /THREE\.WebGLRenderer.*(not supported|context)/i.test(message.text())) return
    errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('#mission-panel-intro:not([hidden])', { timeout: 30_000 })
  await page.waitForFunction(() => !document.querySelector('#loading-screen'))
  const route = await page.evaluate(async () => {
    const response = await fetch('/manus-routes.json')
    return { ok: response.ok, routes: (await response.json()).routes }
  })
  if (!route.ok || route.routes.length !== 1 || route.routes[0].path !== '/') throw new Error('route manifest is missing or invalid')
  if (await page.locator('#info-dialog[open]').count()) await page.locator('#info-dialog button.close-button').click()
  return page
}

const state = page => page.evaluate(() => window.__game.state)
const closeAndCollect = async page => page.screenshot({ path: `${out}/mission-results.png`, fullPage: true })

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist']
  const browserOptions = [{ args }, { args, executablePath: '/usr/bin/chromium' }, { args, channel: 'chrome' }]
  let launchError
  for (const options of browserOptions) {
    try { browser = await chromium.launch(options); break } catch (error) { launchError = error }
  }
  if (!browser) throw new Error(`no preinstalled Playwright browser could start: ${launchError}`)
  const errors = []

  const en = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  await page.screenshot({ path: `${out}/01-briefing.png` })
  if (!await page.locator('#loading-screen').count()) console.log('smoke: loader dismissed after app mount')

  // Verify the seven source pages, two standards links and isolated print stylesheet.
  await page.locator('[data-action="sources"]').click()
  if (await page.locator('.source-list > li').count() !== 9) throw new Error('source registry should list seven PDF resources and two NGSS standards')
  await page.locator('#info-dialog button.close-button').click()
  await page.locator('[data-action="teacher"]').click()
  if (await page.locator('#info-body a[href^="https://"]').count() < 2) throw new Error('Teacher Guide standards links are missing')
  await page.evaluate(() => { window.print = () => {} })
  await page.locator('[data-action="print-teacher"]').click()
  await page.emulateMedia({ media: 'print' })
  const printView = await page.evaluate(() => ({ mode: document.body.dataset.printMode, dialog: getComputedStyle(document.querySelector('#info-dialog')).display, header: getComputedStyle(document.querySelector('.topbar')).display }))
  if (printView.mode !== 'teacher' || printView.dialog !== 'block' || printView.header !== 'none') throw new Error('Teacher Guide print stylesheet did not isolate the guide')
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => { delete document.body.dataset.printMode })
  await page.locator('#info-dialog button.close-button').click()

  // Confirm mouse controls, site/crop settings and the fixed schedule.
  await page.locator('#site-select').selectOption('elysium')
  await page.locator('#crop-select').selectOption('Radishes')
  await page.getByRole('button', { name: 'Judge mode' }).click()
  if ((await state(page)).mode !== 'judge') throw new Error('Judge mode did not toggle')
  await page.getByRole('button', { name: 'Cadet mode' }).click()
  await page.getByRole('button', { name: 'Start fixed campaign' }).click()
  if ((await state(page)).scenario.supply !== 100) throw new Error('fixed campaign schedule changed with site selection')

  await page.locator('#coach-hint').click()
  if (!await page.locator('#info-body').textContent().then(text => text.includes('radiation penalty'))) throw new Error('Coach Hint did not explain the shield threshold')
  await page.locator('#info-dialog button.close-button').click()

  // Input range + scene station selection + Q key adjust the same canonical allocation.
  const shieldSlider = page.locator('[data-allocation="shield"]')
  await shieldSlider.evaluate(element => { element.value = '25'; element.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.locator('.station-tabs button[data-station-select="shield"]').click()
  await page.keyboard.press('q')
  if ((await state(page)).allocation.shield !== 20) throw new Error('Q did not adjust a focused selected station')

  const execute = page.locator('#execute-sol')
  await execute.click()
  const debrief = await state(page)
  if (debrief.phase !== 'debrief' || debrief.trace.length !== 9) throw new Error('Sol execution or Why-Chain trace failed')
  const beforeReplay = debrief.resources
  await page.locator('#replay-sol').click()
  const replayed = await state(page)
  if (replayed.phase !== 'plan' || replayed.resources.battery !== beforeReplay.battery || replayed.resources.replays !== 1) throw new Error('replay did not restore the Sol snapshot and decrement one replay')

  // Mouse-only complete campaign through the real validator and result flow.
  for (let sol = 0; sol < 7; sol += 1) {
    if ((await state(page)).phase !== 'plan') throw new Error(`expected plan at Sol ${sol + 1}`)
    await page.locator('#execute-sol').click()
    const result = await state(page)
    if (result.phase !== 'debrief' || result.solIndex !== sol) throw new Error(`Sol ${sol + 1} did not enter debrief`)
    await page.locator('#continue-sol').click()
  }
  if ((await state(page)).phase !== 'results') throw new Error('campaign did not reach Results')
  if (!await page.locator('#result-stars').textContent()) throw new Error('star rating is empty')
  if (!await page.locator('#result-activity').textContent().then(text => text.includes('1 hint'))) throw new Error('Coach Hint use was not recorded in the Results report')
  await closeAndCollect(page)

  // Practice seeds reproduce their deck. Switching views keeps the same campaign playable.
  await page.evaluate(() => window.__game.startPractice('REDLINE-SMOKE'))
  const deckOne = (await state(page)).scenario
  await page.evaluate(() => window.__game.startPractice('REDLINE-SMOKE'))
  const deckTwo = (await state(page)).scenario
  if (deckOne.event !== deckTwo.event || deckOne.supply !== deckTwo.supply || deckOne.sep !== deckTwo.sep) throw new Error('practice seed was not deterministic')
  if ((await state(page)).webgl) {
    await page.locator('#view-toggle').click()
    if ((await state(page)).view !== 'simple') throw new Error('Simple View toggle failed')
  }

  // The timed Judge demo completes two displayed Sols and ends at its print-friendly report.
  await page.locator('#demo-button').click()
  if ((await state(page)).solIndex !== 5 || (await state(page)).mode !== 'judge') throw new Error('Judge demo did not start on the specified flare Sol')
  await page.clock.runFor(29_000)
  if ((await state(page)).phase !== 'results') throw new Error('Judge demo did not complete through mission results')
  await page.clock.runFor(31_000)
  if ((await page.locator('#demo-button').getAttribute('aria-pressed')) !== 'false') throw new Error('Judge demo did not stop after its 60-second duration')
  await en.close()

  // Touch-size/mobile layout remains playable, with the same mission controls.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const mobile = await openGame(phone, errors)
  await mobile.screenshot({ path: `${out}/02-mobile-briefing.png`, fullPage: true })
  await mobile.getByRole('button', { name: 'Start fixed campaign' }).tap()
  await mobile.locator('#execute-sol').tap()
  if ((await state(mobile)).phase !== 'debrief') throw new Error('mobile campaign controls did not execute a Sol')
  await phone.close()

  // Force WebGL creation failure and confirm the HUD remains fully playable.
  const fallbackContext = await browser.newContext({ viewport: { width: 1024, height: 800 }, locale: 'en-US' })
  const fallback = await openGame(fallbackContext, errors, { disableWebgl: true })
  if ((await state(fallback)).webgl || (await state(fallback)).view !== 'simple') throw new Error('WebGL failure did not switch to Simple View')
  await fallback.getByRole('button', { name: 'Start fixed campaign' }).click()
  await fallback.locator('#execute-sol').click()
  if ((await state(fallback)).phase !== 'debrief') throw new Error('Simple View could not execute a Sol after WebGL failure')
  await fallbackContext.close()

  if (errors.length) throw new Error(`console/page/network errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — mission results and mobile briefing screenshots saved in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}

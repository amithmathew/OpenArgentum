const { chromium } = require(require('path').join(__dirname, 'gifs', 'node_modules', 'playwright'))
const path = require('path')
const fs = require('fs')

const BASE = 'http://localhost:8099'
const PROJECT_ROOT = path.resolve(__dirname, '..')
const VIDEO_DIR = path.join(PROJECT_ROOT, 'scripts', 'gifs', 'videos')
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'assets', 'gifs')
const DEMO_DIR = path.join(PROJECT_ROOT, 'demo')
const VIEWPORT = { width: 1280, height: 720 }

fs.mkdirSync(VIDEO_DIR, { recursive: true })
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

// ─── Helpers ────────────────────────────────────────────────────────────────

async function newRecordingContext(browser, name) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
    colorScheme: 'light',
  })
  context.setDefaultTimeout(60000) // generous for Gemini responses
  const page = await context.newPage()
  return { page, context, name }
}

async function finalizeVideo({ page, context, name }) {
  await page.close()
  const video = page.video()
  if (video) {
    const videoPath = await video.path()
    await context.close()
    const dest = path.join(VIDEO_DIR, `${name}.webm`)
    if (fs.existsSync(dest)) fs.unlinkSync(dest)
    fs.renameSync(videoPath, dest)
    console.log(`  Video saved: ${dest}`)
  } else {
    await context.close()
    console.log(`  Warning: no video for ${name}`)
  }
}

async function waitForCharts(page) {
  await page.waitForSelector('.recharts-responsive-container svg', { timeout: 10000 })
  await page.waitForTimeout(600)
}

async function openChatSidebar(page) {
  const fab = page.locator('button[title="Ask Aurelia"]')
  await fab.waitFor({ state: 'visible', timeout: 5000 })
  await fab.click()
  await page.waitForSelector('input[placeholder*="Ask Aurelia"]', { timeout: 5000 })
  await page.waitForTimeout(500)
}

async function typeAndSend(page, message) {
  const input = page.locator('input[placeholder*="Ask Aurelia"]')
  // Type character by character for visual effect
  await input.click()
  await page.keyboard.type(message, { delay: 35 })
  await page.waitForTimeout(300)
  // Click Send button
  await page.locator('button:text-is("Send")').click()
}

async function waitForResponse(page, { forChart = false, forTable = false, forMutation = false, timeout = 45000 } = {}) {
  // Wait for the streaming to start (send button becomes disabled or loading indicator)
  await page.waitForTimeout(1000)

  if (forChart) {
    // Wait for a recharts element inside the chat panel area
    await page.locator('.recharts-responsive-container').last().waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(1500) // let chart animate
  } else if (forTable) {
    // Wait for a table element in the chat
    await page.locator('table').last().waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(1000)
  } else if (forMutation) {
    // Wait for the mutation proposal - look for approve/apply buttons
    await page.locator('button:has-text("Approve"), button:has-text("Apply"), button:has-text("approve")').first().waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(1000)
  } else {
    // Generic: wait for "Used" tool indicator (means response is done)
    await page.locator('text=/Used \\d+ tool/').last().waitFor({ state: 'visible', timeout })
    await page.waitForTimeout(500)
  }
}

// ─── 1. Hero Screenshot ─────────────────────────────────────────────────────

async function captureHero(browser) {
  console.log('Capturing: hero screenshot')
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light' })
  context.setDefaultTimeout(60000)
  const page = await context.newPage()

  await page.goto(BASE + '/')
  await waitForCharts(page)
  await page.waitForTimeout(1000)

  // Open chat sidebar
  await openChatSidebar(page)

  // Send grocery query
  await typeAndSend(page, 'Show me my grocery spending by store over the last 3 months.')
  await waitForResponse(page, { forChart: true })
  await page.waitForTimeout(2000)

  // Take the hero screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'hero.png') })
  console.log(`  Screenshot saved: assets/gifs/hero.png`)

  await context.close()
}

// ─── 2. Import Flow GIF ────────────────────────────────────────────────────

async function recordImport(browser) {
  console.log('Recording: import flow')
  const rec = await newRecordingContext(browser, 'import-flow')
  const { page } = rec

  await page.goto(BASE + '/import')
  await page.waitForSelector('text=Drop PDF', { timeout: 5000 })
  await page.waitForTimeout(2000)

  // Upload the sample statement via the hidden file input
  const fileInput = page.locator('#file-upload')
  await fileInput.setInputFiles(path.join(DEMO_DIR, 'sample_statement.pdf'))

  // Wait for upload to start and processing to begin
  await page.waitForTimeout(2000)

  // Wait for processing to complete — look for "completed" status badge
  await page.locator('text=/completed/i').first().waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(3000)

  // Show the result — maybe scroll to see the statement entry
  await page.waitForTimeout(2000)

  await finalizeVideo(rec)
}

// ─── 3. Aurelia Query GIF (Grocery Spending) ────────────────────────────────

async function recordAureliaQuery(browser) {
  console.log('Recording: Aurelia query (grocery)')
  const rec = await newRecordingContext(browser, 'aurelia-query')
  const { page } = rec

  await page.goto(BASE + '/')
  await waitForCharts(page)
  await page.waitForTimeout(1500)

  await openChatSidebar(page)
  await page.waitForTimeout(1000)

  // Create a new chat session so we start fresh
  const newChatBtn = page.locator('button[title="New chat"]')
  if (await newChatBtn.isVisible()) {
    await newChatBtn.click()
    await page.waitForTimeout(500)
  }

  await typeAndSend(page, 'Show me my grocery spending by store over the last 3 months.')
  await waitForResponse(page, { forChart: true })
  await page.waitForTimeout(3000)

  await finalizeVideo(rec)
}

// ─── 4. Aurelia Mutation GIF (Ticketmaster Tagging) ─────────────────────────

async function recordAureliaMutation(browser) {
  console.log('Recording: Aurelia mutation (Ticketmaster)')
  const rec = await newRecordingContext(browser, 'aurelia-mutation')
  const { page } = rec

  await page.goto(BASE + '/')
  await waitForCharts(page)
  await page.waitForTimeout(1500)

  await openChatSidebar(page)
  await page.waitForTimeout(1000)

  const newChatBtn = page.locator('button[title="New chat"]')
  if (await newChatBtn.isVisible()) {
    await newChatBtn.click()
    await page.waitForTimeout(500)
  }

  await typeAndSend(page, 'Can you tag all my Ticketmaster expenses as "Impulse", and move them to the discretionary tier?')

  // Wait for the mutation proposal with approve button
  await waitForResponse(page, { forMutation: true, timeout: 60000 })
  await page.waitForTimeout(2000)

  // Click approve/apply
  const approveBtn = page.locator('button:has-text("Approve"), button:has-text("Apply")').first()
  if (await approveBtn.isVisible()) {
    await approveBtn.click()
    // Wait for the "Done" result
    await page.locator('text=/Done/').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForTimeout(3000)
  }

  await finalizeVideo(rec)
}

// ─── 5. Aurelia Analysis GIF (January vs December) ──────────────────────────

async function recordAureliaAnalysis(browser) {
  console.log('Recording: Aurelia analysis (Jan vs Dec)')
  const rec = await newRecordingContext(browser, 'aurelia-analysis')
  const { page } = rec

  await page.goto(BASE + '/')
  await waitForCharts(page)
  await page.waitForTimeout(1500)

  await openChatSidebar(page)
  await page.waitForTimeout(1000)

  const newChatBtn = page.locator('button[title="New chat"]')
  if (await newChatBtn.isVisible()) {
    await newChatBtn.click()
    await page.waitForTimeout(500)
  }

  await typeAndSend(page, 'Why were my January expenses so much higher than December? Help me understand what\'s changed.')
  await waitForResponse(page, { forTable: true, timeout: 60000 })
  await page.waitForTimeout(3000)

  await finalizeVideo(rec)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true })

  try {
    // Order matters: mutation modifies data, so run it last
    await captureHero(browser)
    await recordImport(browser)
    await recordAureliaQuery(browser)
    await recordAureliaAnalysis(browser)
    await recordAureliaMutation(browser)

    console.log('\nAll recordings complete!')
    console.log('Videos in:', VIDEO_DIR)
    console.log('Hero screenshot in:', SCREENSHOT_DIR)
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1";
const OUTPUT_DIR = "./outputs";

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Generate a single video clip via RunwayML Gen-3 Alpha Turbo
 * RunwayML uses a task-based async API:
 *   1. POST /tasks  → get taskId
 *   2. Poll GET /tasks/:id until status = SUCCEEDED
 *   3. Download the output video
 */
export async function generateVideo({ prompt, characterSeed, style, duration, index, jobId }) {
  if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY manquante dans .env");

  const outputPath = path.join(OUTPUT_DIR, `${jobId}_scene${index}.mp4`);

  // ── 1. Create task ─────────────────────────────────────────────────────────
  const taskRes = await fetch(`${RUNWAY_API_URL}/tasks`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      taskType: "gen3a_turbo",    // Gen-3 Alpha Turbo (fastest + best quality)
      internal: false,
      options: {
        name: `animeforge_${jobId}_scene${index}`,
        seconds: duration,        // 4s (short) or 8s (long)
        text_prompt: buildEnhancedPrompt(prompt, characterSeed, style),
        seed: deriveCharacterSeed(characterSeed), // ensures character consistency
        exploreMode: false,
        watermark: false,
        enhance_prompt: false,    // we provide our own detailed prompt
        resolution: "720p",
      },
    }),
  });

  if (!taskRes.ok) {
    const err = await taskRes.text();
    throw new Error(`RunwayML task creation failed: ${err}`);
  }

  const { id: taskId } = await taskRes.json();
  console.log(`[RunwayML] Task created: ${taskId} for scene ${index}`);

  // ── 2. Poll until done ──────────────────────────────────────────────────────
  const videoUrl = await pollUntilDone(taskId);

  // ── 3. Download video ───────────────────────────────────────────────────────
  await downloadFile(videoUrl, outputPath);
  console.log(`[RunwayML] Scene ${index} saved to ${outputPath}`);

  return outputPath;
}

async function pollUntilDone(taskId, maxWaitMs = 300_000, intervalMs = 5000) {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(intervalMs);

    const res = await fetch(`${RUNWAY_API_URL}/tasks/${taskId}`, {
      headers: {
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    const task = await res.json();
    console.log(`[RunwayML] Task ${taskId} status: ${task.status}`);

    if (task.status === "SUCCEEDED") {
      const videoUrl = task.output?.[0];
      if (!videoUrl) throw new Error("RunwayML task succeeded but no output URL found.");
      return videoUrl;
    }

    if (task.status === "FAILED") {
      throw new Error(`RunwayML task failed: ${task.failure || task.failureCode || "Unknown error"}`);
    }

    // PENDING | RUNNING — keep polling
  }

  throw new Error(`RunwayML task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video from RunwayML: ${res.status}`);
  const buffer = await res.buffer();
  fs.writeFileSync(destPath, buffer);
}

// Build a highly detailed prompt that enforces visual consistency
function buildEnhancedPrompt(basePrompt, characterSeed, style) {
  return `${basePrompt}, consistent character appearance: ${characterSeed}, no character design change, same face same outfit throughout clip, smooth motion, fluid animation, professional anime production quality`;
}

// Derive a numeric seed from the character seed string
// Same character → same seed → consistent face/style across scenes
function deriveCharacterSeed(characterSeed) {
  let hash = 0;
  for (let i = 0; i < characterSeed.length; i++) {
    hash = (hash * 31 + characterSeed.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

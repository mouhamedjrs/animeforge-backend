import { execSync, exec } from "child_process";
import path from "path";
import fs from "fs";
import { promisify } from "util";

const execAsync = promisify(exec);
const OUTPUT_DIR = "./outputs";

/**
 * Assembles video clips + music into a final MP4 using ffmpeg.
 * Steps:
 *   1. Concat all scene clips
 *   2. Mix in music (loops/trims to match video length)
 *   3. Burn watermark text
 *   4. Output final MP4
 */
export async function assembleVideo({ videoClips, musicPath, jobId, watermark = true }) {
  ensureFFmpeg();

  const finalPath = path.join(OUTPUT_DIR, `${jobId}_final.mp4`);
  const concatListPath = path.join(OUTPUT_DIR, `${jobId}_concat.txt`);

  // ── 1. Write concat file ───────────────────────────────────────────────────
  const concatContent = videoClips.map(p => `file '${path.resolve(p)}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  // ── 2. Concat clips ────────────────────────────────────────────────────────
  const concatPath = path.join(OUTPUT_DIR, `${jobId}_concat.mp4`);
  await execAsync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${concatPath}"`
  );
  console.log(`[FFmpeg] Clips concatenated → ${concatPath}`);

  // ── 3. Get total video duration ────────────────────────────────────────────
  const durationSecs = await getVideoDuration(concatPath);
  console.log(`[FFmpeg] Total duration: ${durationSecs}s`);

  // ── 4. Mix video + music + optional watermark ──────────────────────────────
  const watermarkFilter = watermark
    ? `,drawtext=text='AnimeForge Free':fontcolor=white@0.35:fontsize=18:x=w-tw-20:y=h-th-20:font=Arial`
    : "";

  const musicArgs = fs.existsSync(musicPath)
    ? `-stream_loop -1 -i "${musicPath}" -shortest -map 0:v -map 1:a -c:v libx264 -c:a aac -b:a 192k`
    : `-c:v libx264 -an`; // no audio if music failed

  await execAsync(
    `ffmpeg -y -i "${concatPath}" ${musicArgs} ` +
    `-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2${watermarkFilter}" ` +
    `-r 24 -pix_fmt yuv420p -movflags +faststart "${finalPath}"`
  );

  console.log(`[FFmpeg] Final video assembled → ${finalPath}`);

  // ── 5. Cleanup temp files ──────────────────────────────────────────────────
  cleanup([concatListPath, concatPath, ...videoClips, musicPath]);

  return finalPath;
}

async function getVideoDuration(videoPath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  return parseFloat(stdout.trim()) || 30;
}

function ensureFFmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    throw new Error(
      "ffmpeg n'est pas installé. Installez-le avec:\n" +
      "  Ubuntu/Debian: sudo apt install ffmpeg\n" +
      "  macOS: brew install ffmpeg\n" +
      "  Windows: https://ffmpeg.org/download.html"
    );
  }
}

function cleanup(files) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
}

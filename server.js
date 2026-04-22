import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generateScenes } from "./services/claude.js";
import { generateVideo } from "./services/runway.js";
import { generateMusic } from "./services/music.js";
import { assembleVideo } from "./services/assembler.js";
import { jobStore } from "./services/jobStore.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── POST /generate ─────────────────────────────────────────────────────────
// Starts a full video generation job
// Body: { script, character, style, duration, lang }
app.post("/generate", async (req, res) => {
  const { script, character, style, duration, lang = "fr" } = req.body;

  if (!script || script.trim().length < 10) {
    return res.status(400).json({ error: "Script trop court." });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  jobStore.set(jobId, { status: "pending", progress: 0, step: "Démarrage..." });

  res.json({ jobId });

  // Run pipeline in background
  runPipeline({ jobId, script, character, style, duration, lang }).catch(err => {
    jobStore.set(jobId, { status: "error", error: err.message });
  });
});

// ─── GET /status/:jobId ──────────────────────────────────────────────────────
app.get("/status/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job introuvable." });
  res.json(job);
});

// ─── GET /download/:jobId ────────────────────────────────────────────────────
app.get("/download/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);
  if (!job || job.status !== "done") {
    return res.status(404).json({ error: "Vidéo non prête." });
  }
  res.download(job.outputPath, `animeforge_${req.params.jobId}.mp4`);
});

// ─── Pipeline ────────────────────────────────────────────────────────────────
async function runPipeline({ jobId, script, character, style, duration, lang }) {
  const update = (step, progress, extra = {}) => {
    jobStore.set(jobId, { ...jobStore.get(jobId), status: "running", step, progress, ...extra });
    console.log(`[${jobId}] ${progress}% — ${step}`);
  };

  // Step 1 — Analyze script with Claude
  update("Analyse du script avec Claude AI...", 10);
  const scenes = await generateScenes({ script, character, style, duration, lang });

  // Step 2 — Generate video clips via RunwayML (one per scene)
  update("Génération des scènes vidéo (RunwayML)...", 25);
  const videoClips = [];
  for (let i = 0; i < scenes.length; i++) {
    update(`Scène ${i + 1}/${scenes.length} en cours...`, 25 + i * 15);
    const clipPath = await generateVideo({
      prompt: scenes[i].visualPrompt,
      characterSeed: scenes[i].characterSeed,
      style,
      duration: duration === "short" ? 4 : 8, // seconds per clip
      index: i,
      jobId,
    });
    videoClips.push(clipPath);
  }

  // Step 3 — Generate music
  update("Composition musicale IA...", 75);
  const musicPath = await generateMusic({
    mood: scenes[0].musicMood,
    style,
    totalDuration: duration === "short" ? 20 : 90,
    jobId,
  });

  // Step 4 — Assemble final MP4 with ffmpeg
  update("Assemblage final de la vidéo...", 88);
  const outputPath = await assembleVideo({ videoClips, musicPath, jobId, watermark: true });

  update("Terminé ✓", 100);
  jobStore.set(jobId, {
    status: "done",
    progress: 100,
    step: "Vidéo prête !",
    outputPath,
    scenes: scenes.map(s => ({
      label: s.label,
      description: s.description,
      visualPrompt: s.visualPrompt,
    })),
    musicMood: scenes[0].musicMood,
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`AnimeForge backend running on port ${PORT}`));

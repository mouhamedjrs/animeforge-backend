import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const OUTPUT_DIR = "./outputs";

/**
 * Music generation via ElevenLabs Sound Generation API
 * (Simple, reliable, no waitlist — good for ambient/atmospheric tracks)
 *
 * Alternative: Suno AI (better quality but requires separate account setup)
 * Swap out the provider below if you prefer Suno.
 */
export async function generateMusic({ mood, style, totalDuration, jobId }) {
  const musicPath = path.join(OUTPUT_DIR, `${jobId}_music.mp3`);

  const provider = process.env.MUSIC_PROVIDER || "elevenlabs"; // "elevenlabs" | "suno"

  if (provider === "elevenlabs") {
    await generateWithElevenLabs({ mood, style, totalDuration, musicPath });
  } else if (provider === "suno") {
    await generateWithSuno({ mood, style, totalDuration, musicPath });
  } else {
    throw new Error(`Unknown MUSIC_PROVIDER: ${provider}`);
  }

  return musicPath;
}

// ── ElevenLabs Sound Effects API ─────────────────────────────────────────────
async function generateWithElevenLabs({ mood, style, totalDuration, musicPath }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY manquante dans .env");

  const prompt = buildMusicPrompt(mood, style);
  console.log(`[Music] ElevenLabs prompt: "${prompt}"`);

  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: Math.min(totalDuration, 22), // ElevenLabs max = 22s
      prompt_influence: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs music generation failed: ${err}`);
  }

  const buffer = await res.buffer();
  fs.writeFileSync(musicPath, buffer);
  console.log(`[Music] Saved to ${musicPath}`);
}

// ── Suno AI API (alternative) ─────────────────────────────────────────────────
async function generateWithSuno({ mood, style, totalDuration, musicPath }) {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) throw new Error("SUNO_API_KEY manquante dans .env");

  const prompt = buildMusicPrompt(mood, style);

  // Step 1 — Create generation
  const createRes = await fetch("https://studio-api.suno.ai/api/external/generate/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      mv: "chirp-v3-5",
      title: "AnimeForge Soundtrack",
      tags: buildSunoTags(style),
      make_instrumental: true,
      wait_audio: false,
    }),
  });

  const { id: generationId } = await createRes.json();

  // Step 2 — Poll
  const audioUrl = await pollSuno(generationId, apiKey);

  // Step 3 — Download
  const dlRes = await fetch(audioUrl);
  const buffer = await dlRes.buffer();
  fs.writeFileSync(musicPath, buffer);
}

async function pollSuno(id, apiKey, maxWait = 120_000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://studio-api.suno.ai/api/external/clips/?ids=${id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const data = await res.json();
    const clip = data?.[0];
    if (clip?.status === "complete") return clip.audio_url;
    if (clip?.status === "error") throw new Error("Suno generation failed.");
  }
  throw new Error("Suno timed out.");
}

// ── Prompt builders ───────────────────────────────────────────────────────────
function buildMusicPrompt(mood, style) {
  const styleMap = {
    "Studio Ghibli":    "gentle orchestral, piano melody, soft flute, nature sounds, Joe Hisaishi inspired",
    "Makoto Shinkai":   "emotional piano and strings, RADWIMPS style, cinematic swells, bittersweet",
    "Anime 90s":        "synth melody, upbeat 90s anime opening style, electric guitar, nostalgic",
    "Watercolor Dream": "ambient dreamy piano, soft pads, ethereal bells, tranquil watercolor atmosphere",
    "Ink & Mist":       "minimalist koto and shakuhachi, sparse percussion, contemplative, ink wash feeling",
  };
  const styleHint = styleMap[style] || styleMap["Studio Ghibli"];
  return `${styleHint}, ${mood}, seamless loop, no vocals, high quality`;
}

function buildSunoTags(style) {
  const tagMap = {
    "Studio Ghibli":    "orchestral,piano,ambient,anime,ghibli",
    "Makoto Shinkai":   "cinematic,piano,emotional,anime,strings",
    "Anime 90s":        "synth,retro,anime,upbeat,90s",
    "Watercolor Dream": "ambient,dreamy,piano,ethereal,peaceful",
    "Ink & Mist":       "traditional,japanese,koto,minimalist,atmospheric",
  };
  return tagMap[style] || tagMap["Studio Ghibli"];
}

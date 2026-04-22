import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Style-specific visual keywords for consistent prompts
const STYLE_KEYWORDS = {
  "Studio Ghibli":     "Studio Ghibli style, hand-painted watercolor, soft warm light, detailed foliage, Miyazaki aesthetic, gentle colors",
  "Makoto Shinkai":    "Makoto Shinkai style, hyper-detailed backgrounds, dramatic crepuscular rays, vivid saturated sky, cinematic lighting",
  "Anime 90s":         "1990s anime style, cel-shading, bold outlines, vibrant flat colors, classic animation, retro anime aesthetics",
  "Watercolor Dream":  "soft watercolor anime, dreamy pastel palette, loose brushwork, impressionistic, ethereal glow",
  "Ink & Mist":        "monochrome ink wash anime, misty atmosphere, sumi-e inspired, high contrast, minimalist backgrounds",
};

// Character seed descriptions for consistency
const CHARACTER_SEEDS = {
  "Yuki": "young girl, short black hair, green forest outfit, curious brown eyes, small build",
  "Hiro": "tall young man, dark green cloak, calm forest guardian, gentle brown eyes",
  "Sora": "ethereal figure, flowing silver hair, translucent wind-spirit form, glowing blue eyes",
  "Mei":  "teenage girl, witch hat, long auburn hair, purple apprentice robe, determined expression",
  "Ren":  "lone traveler, worn brown coat, short dark hair, weathered face, quiet intensity",
};

export async function generateScenes({ script, character, style, duration, lang }) {
  const styleKeywords = STYLE_KEYWORDS[style] || STYLE_KEYWORDS["Studio Ghibli"];
  const charSeed      = CHARACTER_SEEDS[character] || CHARACTER_SEEDS["Yuki"];
  const sceneCount    = duration === "short" ? 4 : 8;

  const systemPrompt = `You are an expert anime storyboard director and prompt engineer.
Your job is to break a user script into ${sceneCount} cinematic scenes for AI video generation.
You must maintain character visual consistency across ALL scenes using the seed description.
Always respond in valid JSON only — no markdown, no backticks.`;

  const userPrompt = `Script: "${script}"

Character: ${character} — seed: "${charSeed}"
Visual style: "${style}" — keywords: "${styleKeywords}"
Language for labels/descriptions: ${lang}

Return a JSON array of ${sceneCount} scenes. Each scene object must have:
- "label": short scene title (2-4 words, in ${lang})
- "description": what happens in this scene (1-2 sentences in ${lang})
- "visualPrompt": English prompt for RunwayML video generation. Must include:
    * The full character seed verbatim for consistency
    * The full style keywords verbatim
    * The scene action/setting
    * Camera movement (e.g. "slow pan left", "gentle zoom in", "static wide shot")
    * Lighting description
- "musicMood": only for scene index 0 — one sentence describing overall music mood in ${lang}
- "characterSeed": repeat the character seed verbatim (for API use)

Example visualPrompt format:
"[character seed], [action/setting], [camera movement], [lighting], [style keywords], high quality anime, 4K"`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content.map(b => b.text || "").join("");
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Claude returned invalid JSON for scene analysis.");
  }
}

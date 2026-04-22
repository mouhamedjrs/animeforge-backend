# 🎬 AnimeForge Backend

Backend Node.js complet pour générer des vidéos animées style Ghibli/Anime par IA.

## Architecture du Pipeline

```
Script (texte)
    ↓
[Claude AI] → Analyse + découpe en scènes + prompts visuels
    ↓
[RunwayML Gen-3] → Génère chaque clip vidéo (MP4)
    ↓
[ElevenLabs / Suno] → Génère la musique selon le mood
    ↓
[FFmpeg] → Assemble clips + musique + filigrane → MP4 final
    ↓
Téléchargement MP4
```

## Prérequis

- **Node.js 18+**
- **ffmpeg** installé sur le système
- Clés API : Anthropic + RunwayML + ElevenLabs (ou Suno)

### Installer ffmpeg

```bash
# Ubuntu / Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Télécharger sur https://ffmpeg.org/download.html
```

## Installation

```bash
# 1. Cloner / copier le dossier
cd animeforge-backend

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env et remplir vos clés API

# 4. Lancer le serveur
npm start
# ou en mode développement (auto-restart)
npm run dev
```

## API Endpoints

### `POST /generate`
Lance la génération d'une vidéo.

**Body JSON :**
```json
{
  "script": "Une jeune fille marche dans une forêt...",
  "character": "Yuki",
  "style": "Studio Ghibli",
  "duration": "short",
  "lang": "fr"
}
```

**Valeurs possibles :**
- `character`: `"Yuki"` | `"Hiro"` | `"Sora"` | `"Mei"` | `"Ren"`
- `style`: `"Studio Ghibli"` | `"Makoto Shinkai"` | `"Anime 90s"` | `"Watercolor Dream"` | `"Ink & Mist"`
- `duration`: `"short"` (15-30s) | `"long"` (1-3min)
- `lang`: `"fr"` | `"en"` | `"es"`

**Réponse :**
```json
{ "jobId": "job_1234567890_abc12" }
```

---

### `GET /status/:jobId`
Vérifie l'état d'un job.

**Réponse en cours :**
```json
{
  "status": "running",
  "progress": 45,
  "step": "Scène 2/4 en cours..."
}
```

**Réponse terminée :**
```json
{
  "status": "done",
  "progress": 100,
  "step": "Vidéo prête !",
  "outputPath": "./outputs/job_xxx_final.mp4",
  "scenes": [...],
  "musicMood": "Doux et mystérieux"
}
```

---

### `GET /download/:jobId`
Télécharge le fichier MP4 final.

---

## Connecter au Frontend (React)

```javascript
// 1. Lancer la génération
const { jobId } = await fetch("http://localhost:3001/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ script, character, style, duration, lang }),
}).then(r => r.json());

// 2. Poller le statut
const interval = setInterval(async () => {
  const status = await fetch(`http://localhost:3001/status/${jobId}`).then(r => r.json());
  setProgress(status.progress);
  setStep(status.step);

  if (status.status === "done") {
    clearInterval(interval);
    // 3. Déclencher le téléchargement
    window.location.href = `http://localhost:3001/download/${jobId}`;
  }
}, 3000);
```

## Coûts estimés par vidéo

| Service | Courte (30s) | Longue (90s) |
|---------|-------------|-------------|
| RunwayML Gen-3 | ~$0.80 | ~$2.40 |
| ElevenLabs | ~$0.01 | ~$0.01 |
| Anthropic Claude | ~$0.01 | ~$0.02 |
| **Total** | **~$0.82** | **~$2.43** |

## Déploiement en production

```bash
# Sur un VPS (Ubuntu) avec PM2
npm install -g pm2
pm2 start server.js --name animeforge
pm2 save
pm2 startup
```

Pour la scalabilité, remplacer le jobStore in-memory par **Redis** (voir commentaire dans `services/jobStore.js`).

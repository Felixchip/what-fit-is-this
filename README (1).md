# fitcheck-backend

Frame extraction service for FitCheck. Downloads Instagram/TikTok videos via `yt-dlp` and extracts key frames with `FFmpeg`.

## Stack

- Node.js 20 + Express
- yt-dlp (video download)
- FFmpeg (frame extraction)
- Docker (bakes all binaries in)

## API

### `GET /health`
Returns `{ status: "ok" }` — used by Railway for healthchecks.

### `POST /extract`
```json
{ "url": "https://www.tiktok.com/@user/video/..." }
```
Returns:
```json
{
  "ok": true,
  "count": 6,
  "frames": ["<base64 jpeg>", ...]
}
```

Supported URLs: `instagram.com`, `tiktok.com`, `vm.tiktok.com`

## Deploy to Railway

### 1. Create repo and push

```bash
git init
git add .
git commit -m "init fitcheck-backend"
gh repo create fitcheck-backend --public --push --source=.
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `fitcheck-backend`
3. Railway auto-detects the Dockerfile — no config needed
4. Wait for build (~2-3 min first time, yt-dlp + FFmpeg are heavy)
5. Go to Settings → Networking → Generate Domain
6. Copy your public URL e.g. `https://fitcheck-backend-production.up.railway.app`

### 3. Set environment variables (optional)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `ALLOWED_ORIGIN` | CORS origin for your frontend | `*` |

Set in Railway → Variables tab.

### 4. Update the frontend

In the FitCheck frontend widget, set:
```js
const BACKEND_URL = 'https://your-service.up.railway.app';
```

## Rate limits

10 requests per minute per IP. Adjust in `src/index.js`.

## Notes

- Only public posts work. Private accounts will fail with a clear error.
- Max video duration is 3 minutes.
- Frames are extracted at 720p max to keep base64 payload manageable.
- yt-dlp may need occasional updates as platforms change. Run `docker build --no-cache` to pull the latest release.

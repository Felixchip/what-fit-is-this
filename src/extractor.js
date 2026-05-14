const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Use bundled binaries — no system ffmpeg/ffprobe install needed
const FFMPEG_PATH = require('ffmpeg-static');
const FFPROBE_PATH = require('ffprobe-static').path;

const execFileAsync = promisify(execFile);

const NUM_FRAMES = 12;
const MAX_VIDEO_DURATION = 180; // seconds
const FRAME_QUALITY = 85;

// ─── Public API ────────────────────────────────────────────────────────────────

/** Extract + filter frames from a social media URL (TikTok / Instagram) */
async function extractFrames(url, anthropic) {
  const { tmpDir, cleanup } = makeTmpDir();
  try {
    const videoPath = await downloadVideo(url, tmpDir);
    return await processVideo(videoPath, tmpDir, anthropic);
  } finally {
    cleanup();
  }
}

/** Extract + filter frames from a locally uploaded video file path */
async function extractFramesFromFile(filePath, anthropic) {
  const { tmpDir, cleanup } = makeTmpDir();
  try {
    return await processVideo(filePath, tmpDir, anthropic);
  } finally {
    cleanup();
  }
}

// ─── Core pipeline ─────────────────────────────────────────────────────────────

async function processVideo(videoPath, tmpDir, anthropic) {
  const duration = await getVideoDuration(videoPath);

  if (duration > MAX_VIDEO_DURATION) {
    throw new Error(`Video too long (${Math.round(duration)}s). Max is ${MAX_VIDEO_DURATION}s.`);
  }

  const { framePaths, timestamps } = await extractKeyFrames(videoPath, tmpDir, duration);
  const frames = framePaths.map(fp => fs.readFileSync(fp).toString('base64'));

  // Filter: only keep frames that clearly show a person wearing clothing
  const filtered = await filterFashionFrames(frames, timestamps, anthropic);
  return filtered;
}

// ─── Fashion-frame filter (Claude Haiku — cheap YES/NO per frame) ───────────────

async function filterFashionFrames(frames, timestamps, anthropic) {
  console.log(`[filter] screening ${frames.length} frames for fashion content...`);

  const checks = await Promise.all(
    frames.map(async (frame, i) => {
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 10,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: frame },
              },
              {
                type: 'text',
                text: 'Does this image clearly show at least one person wearing clothing or fashion items? Answer YES or NO only.',
              },
            ],
          }],
        });
        const answer = (msg.content[0]?.text || 'NO').trim().toUpperCase();
        const pass = answer.startsWith('YES');
        console.log(`[filter] frame ${i} @ ${timestamps[i]}s — ${pass ? 'PASS' : 'skip'}`);
        return pass ? { frame, timestamp: timestamps[i] } : null;
      } catch (e) {
        console.warn(`[filter] frame ${i} check failed: ${e.message} — including anyway`);
        return { frame, timestamp: timestamps[i] }; // include on error to be safe
      }
    })
  );

  const valid = checks.filter(Boolean);

  // Fallback: if filter wiped everything (e.g. all API calls failed), return all
  if (valid.length === 0) {
    console.warn('[filter] no frames passed — falling back to all frames');
    return { frames, timestamps };
  }

  console.log(`[filter] kept ${valid.length} / ${frames.length} frames`);
  return {
    frames: valid.map(v => v.frame),
    timestamps: valid.map(v => v.timestamp),
  };
}

// ─── Download ──────────────────────────────────────────────────────────────────

async function downloadVideo(url, tmpDir) {
  const outputPath = path.join(tmpDir, 'video.mp4');

  // TikTok blocks datacenter IPs — use free API fallback
  if (url.includes('tiktok.com')) {
    try {
      const apiRes = await fetch(`https://tikwm.com/api/?url=${url}`);
      const apiData = await apiRes.json();
      if (apiData.data && apiData.data.play) {
        const mp4Res = await fetch(apiData.data.play);
        const buffer = await mp4Res.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        return outputPath;
      }
    } catch (e) {
      console.log('TikWM fallback failed:', e.message);
    }
  }

  const defaultOutputPath = path.join(tmpDir, 'video.%(ext)s');
  const baseArgs = [
    '--no-playlist',
    '--format', 'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720]/best',
    '--output', defaultOutputPath,
    '--no-warnings',
    '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    url,
  ];

  // Try with browser cookies first (helps with login-gated content), then fall back
  const attempts = [
    [...baseArgs, '--cookies-from-browser', 'firefox'],
    [...baseArgs, '--cookies-from-browser', 'chrome'],
    baseArgs,
  ];

  let lastErr = null;
  for (const args of attempts) {
    try {
      await execFileAsync('yt-dlp', args, { timeout: 60000 });
      // Success — check file was written
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('video.'));
      if (files.length) return path.join(tmpDir, files[0]);
    } catch (err) {
      lastErr = err;
      const msg = (err.stderr || err.message || '').toLowerCase();
      // If this is a hard content restriction, no point retrying with other cookie sources
      if (msg.includes("can't be seen by certain audiences") || msg.includes('not available')) {
        throw new Error(
          'This post is restricted by the creator — it\'s limited to certain audiences and cannot be downloaded. Please try a fully public post or reel.'
        );
      }
      // Otherwise continue to next attempt
    }
  }

  const detail = (lastErr?.stderr || lastErr?.message || '').split('\n')[0].trim();
  console.error('[download] yt-dlp all attempts failed:', detail);
  throw new Error('Could not download video — ensure the post is public and the account is not private.');
}

// ─── FFmpeg helpers ────────────────────────────────────────────────────────────

async function getVideoDuration(videoPath) {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    videoPath,
  ]);
  const info = JSON.parse(stdout);
  return parseFloat(info.format.duration || '0');
}

async function extractKeyFrames(videoPath, tmpDir, duration) {
  const frameDir = path.join(tmpDir, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });

  // Spread frames across the video, skipping first and last 5%
  const start = duration * 0.05;
  const end = duration * 0.95;
  const step = (end - start) / (NUM_FRAMES - 1);

  const framePaths = [];
  const timestamps = [];

  for (let i = 0; i < NUM_FRAMES; i++) {
    const timestamp = start + i * step;
    const outPath = path.join(frameDir, `frame-${String(i).padStart(3, '0')}.jpg`);

    await execFileAsync(FFMPEG_PATH, [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', String(Math.round((100 - FRAME_QUALITY) / 10) + 1),
      '-vf', 'scale=720:-2',
      outPath,
    ], { timeout: 15000 });

    if (fs.existsSync(outPath)) {
      framePaths.push(outPath);
      timestamps.push(Math.round(timestamp));
    }
  }

  if (!framePaths.length) throw new Error('FFmpeg could not extract any frames');
  return { framePaths, timestamps };
}

// ─── Util ──────────────────────────────────────────────────────────────────────

function makeTmpDir() {
  const jobId = crypto.randomBytes(6).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `whatfitisthis-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });
  return { tmpDir, cleanup };
}

module.exports = { extractFrames, extractFramesFromFile };

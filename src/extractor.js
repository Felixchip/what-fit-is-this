const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

const NUM_FRAMES = 6;
const MAX_VIDEO_DURATION = 180; // seconds — bail on anything over 3min
const FRAME_QUALITY = 85; // jpeg quality 0-100

async function extractFrames(url) {
  const jobId = crypto.randomBytes(6).toString('hex');
  const tmpDir = path.join(os.tmpdir(), `whatfitisthis-${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const videoPath = await downloadVideo(url, tmpDir);
    const duration = await getVideoDuration(videoPath);

    if (duration > MAX_VIDEO_DURATION) {
      throw new Error(`Video too long (${Math.round(duration)}s). Max is ${MAX_VIDEO_DURATION}s.`);
    }

    const framePaths = await extractKeyFrames(videoPath, tmpDir, duration);
    const frames = framePaths.map(fp => {
      const buf = fs.readFileSync(fp);
      return buf.toString('base64');
    });

    return frames;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function downloadVideo(url, tmpDir) {
  const outputPath = path.join(tmpDir, 'video.mp4');

  // TikTok heavily blocks Datacenter IPs (Railway). 
  // We use a free API fallback specifically for TikToks.
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
  const args = [
    '--no-playlist',
    '--format', 'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]/best[height<=720]/best',
    '--output', defaultOutputPath,
    '--no-warnings',
    '--quiet',
    '--add-header', 'User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    url,
  ];

  try {
    await execFileAsync('yt-dlp', args, { timeout: 60000 });
  } catch (err) {
    throw new Error('Could not download video. Defaulting to block. Ensure post is public.');
  }

  // Find the downloaded file from yt-dlp
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('video.'));
  if (!files.length) throw new Error('Download succeeded but no video file found');

  return path.join(tmpDir, files[0]);
}

async function getVideoDuration(videoPath) {
  const { stdout } = await execFileAsync('ffprobe', [
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

  for (let i = 0; i < NUM_FRAMES; i++) {
    const timestamp = start + i * step;
    const outPath = path.join(frameDir, `frame-${String(i).padStart(3, '0')}.jpg`);

    await execFileAsync('ffmpeg', [
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', String(Math.round((100 - FRAME_QUALITY) / 10) + 1), // ffmpeg quality scale 1-10
      '-vf', 'scale=720:-2',
      outPath,
    ], { timeout: 15000 });

    if (fs.existsSync(outPath)) {
      framePaths.push(outPath);
    }
  }

  if (!framePaths.length) throw new Error('FFmpeg could not extract any frames');
  return framePaths;
}

module.exports = { extractFrames };

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Anthropic } = require('@anthropic-ai/sdk');
const { extractFrames } = require('./extractor');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, 
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests — slow down' },
});
app.use('/extract', limiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'what-fit-is-this-backend', ts: Date.now() });
});

app.post('/extract', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url' });
  }

  const supported = /instagram\.com|tiktok\.com|vm\.tiktok\.com/i.test(url);
  if (!supported) {
    return res.status(400).json({ error: 'Only Instagram and TikTok URLs are supported' });
  }

  console.log(`[extract] ${new Date().toISOString()} — ${url}`);

  try {
    const frames = await extractFrames(url);
    res.json({ ok: true, frames, count: frames.length });
  } catch (err) {
    console.error('[extract] error:', err.message);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

app.post('/analyze', limiter, async (req, res) => {
  const { image, mimeType } = req.body;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid base64 image' });
  }

  console.log(`[analyze] ${new Date().toISOString()} — Analyzing image...`);

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `You are a fashion product detection AI. Identify every clothing item, accessory, footwear, or fashion product visible on any person in the image. Return ONLY a valid JSON array, no markdown or explanation. Each object: {"category":"Sneakers|T-Shirt|Pants|Cap|Watch|Bag|Jacket|etc","name":"specific product name","brand":"brand or Unknown","description":"1-2 sentence visual description","priceMin":40,"priceMax":200,"currency":"USD","searchQuery":"best search string","confidence":"high|medium|low"}. Return 1-8 items. JSON array only.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType || "image/jpeg",
                data: image,
              },
            },
            {
              type: "text",
              text: "Identify all clothing and fashion products in this image. Remember, return ONLY a valid JSON array, NO markdown formatting or other explanation."
            }
          ],
        }
      ],
    });

    res.json({ ok: true, result: msg.content[0].text });
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

app.listen(PORT, () => {
  console.log(`What fit is this backend running on port ${PORT}`);
});

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
      max_tokens: 4096,
      tools: [
        {
          name: "record_fashion_items",
          description: "Record the fashion products found in the image.",
          input_schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    name: { type: "string", description: "Specific product name or a highly descriptive stylistic name if generic" },
                    brand: { type: "string", description: "The precise brand if visible, or a highly similar aesthetic brand. Use 'Vintage/Unbranded' if generic." },
                    description: { type: "string", description: "Vivid visual description focusing on cut, fabric, color, and unique hardware." },
                    priceMin: { type: "number" },
                    priceMax: { type: "number" },
                    currency: { type: "string", description: "Always USD" },
                    buyLocations: { type: "array", items: { type: "string" }, description: "1-3 realistic retailers. If the item is small, obscure, or seemingly unbranded, prioritize secondhand marketplaces (e.g. eBay, Depop, Grailed, Etsy)."},
                    searchQuery: { type: "string", description: "Highly optimized Google Shopping search string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] }
                  },
                  required: ["category", "name", "brand", "description", "priceMin", "priceMax", "currency", "buyLocations", "searchQuery", "confidence"]
                }
              }
            },
            required: ["items"]
          }
        }
      ],
      tool_choice: { type: "tool", name: "record_fashion_items" },
      system: `You are an elite fashion product detection AI. Identify every clothing item, accessory, footwear, or fashion product visible. For small, obscure, or unbranded items, identify the core style/silhouette, deduce visually matching brands, or label it as 'Vintage/Unbranded' and route it to marketplaces like eBay/Depop. Extract 1-8 items.`,
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
              text: "Identify all clothing and fashion products. Call the tool to meticulously record each detected item."
            }
          ],
        }
      ],
    });

    const toolUse = msg.content.find(c => c.type === 'tool_use');
    if (!toolUse || !toolUse.input || !toolUse.input.items) {
      throw new Error("AI failed to return fashion metadata array");
    }
    
    // We stringify it so the frontend can safely parse it without changing frontend logic
    res.json({ ok: true, result: JSON.stringify(toolUse.input.items) });
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

app.listen(PORT, () => {
  console.log(`What fit is this backend running on port ${PORT}`);
});

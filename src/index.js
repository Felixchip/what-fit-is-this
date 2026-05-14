require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { Anthropic } = require('@anthropic-ai/sdk');
const { extractFrames, extractFramesFromFile } = require('./extractor');
const fs = require('fs');
const os = require('os');

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

// Multer for local video uploads (disk storage, 200MB limit)
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are accepted'));
    }
  },
});

// Rate limiters
const extractLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests — slow down' },
});
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests — slow down' },
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'what-fit-is-this-backend', ts: Date.now() });
});

// ─── Extract from URL (TikTok / Instagram) ────────────────────────────────────

app.post('/extract', extractLimiter, async (req, res) => {
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
    const { frames, timestamps } = await extractFrames(url, anthropic);
    res.json({ ok: true, frames, timestamps, count: frames.length });
  } catch (err) {
    console.error('[extract] error:', err.message);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

// ─── Extract from uploaded video file ────────────────────────────────────────

app.post('/extract-upload', extractLimiter, upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file received' });
  }

  const tempPath = req.file.path;
  console.log(`[extract-upload] ${new Date().toISOString()} — ${req.file.originalname} (${Math.round(req.file.size / 1024)}KB)`);

  try {
    const { frames, timestamps } = await extractFramesFromFile(tempPath, anthropic);
    res.json({ ok: true, frames, timestamps, count: frames.length });
  } catch (err) {
    console.error('[extract-upload] error:', err.message);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
});

// ─── Analyze image (fashion detection) ────────────────────────────────────────

const FASHION_SYSTEM_PROMPT = `You are FITCHECK — an elite fashion product identification AI with encyclopedic knowledge of every luxury house, avant-garde designer, streetwear brand, and independent label. You identify garments from construction, silhouette, fabric, and hardware alone — no logo required.

BRAND IDENTIFICATION METHOD — examine in this order:
1. SILHOUETTE: proportions, shoulder width, hem length, volume, asymmetry
2. CONSTRUCTION: seam placement, paneling, lining style, raw vs finished edges
3. FABRIC: specific textures, weight, drape (Owens memramcook jersey = heavy matte; Bottega intrecciato = wide woven)
4. HARDWARE: zipper brand (Riri/Lampo/YKK), buckle style, button shape, snap type
5. COLORWAY: brand signature palettes — Owens: bone/milk/black/dusk/oil-slick; Margiela: white/institutional grey
6. SOLE/LAST: footwear soles are highly brand-specific (Ramones = chunky crepe; Tabi = split-toe; Triple S = stacked)

DESIGNER VISUAL SIGNATURES:

RICK OWENS / DRKSHDW:
- Silhouette: elongated drop-crotch pods, asymmetric draped panels, extreme shoulder structures, blistered volumes
- Colors: black, ivory, milk, dusk, oyster, army, pearl, caramel — rarely bright. Oil-slick iridescent leather is signature
- Fabrics: heavy matte jersey (memramcook), stone-washed/washed leather, raw canvas, linen, flight satin
- Footwear: Ramones (chunky crepe platform), Geobasket (stacked basketball sole), Bozon, Dunks, Spiral, Larry, Tommy
- Jackets: Geth, Bauhaus, Sphinx, Phlegethon — asymmetric zip, draped lapels, often unstructured
- Pants: Pods (tapered gathered ankle), Pillars, Astaires — elongated rise, often cropped or ankle-tied
- DRKSHDW diffusion: heavier denim, military, utilitarian — same DNA
- Price range: $400-$6000+

MAISON MARGIELA (MMM):
- White stitched number label (0-23) often exposed — but many pieces have no external logo at all
- Tabi boots: immediately identifiable split-toe cloven silhouette
- Deconstruction: unfinished seams, inside-out linings, missing buttons replaced with safety pins
- Replica line: exact vintage reproductions, vintage military, vintage athletic
- MM6 diffusion: graphic, younger — bright pop colours with Margiela DNA
- Price range: $300-$5000+

YOHJI YAMAMOTO / Y-3:
- Strong asymmetry, right-side-heavy silhouettes, extreme volume
- Deep intellectual darkness — predominantly black, white used graphically
- Fabrics: heavy Japanese wool, rayon, technical materials with weight
- Y-3 (Adidas collab): clean athletic proportions with Japanese oversizing

COMME DES GARCONS (CDG):
- Extreme sculptural deconstruction, padded non-body forms, distorted volumes
- CDG PLAY: heart-with-eyes logo on simple basics (red heart = original, black heart = newer)
- CDG HOMME PLUS: architectural deconstruction, often pinstripe in unusual forms
- Signature polka dots, black-and-white graphic prints

ANN DEMEULEMEESTER:
- Romantic darkness: flowing blacks, layered chiffon, narrative drapery
- Lace mixed with heavy leather, poetic layering
- Heeled boots for men, stacked organic necklaces, loose white poet shirts
- Deep V-necks, raw-edge hems, lacing details

ISSEY MIYAKE / PLEATS PLEASE:
- Permanent accordion pleating — garments spring back to pleated form
- Architectural geometry, origami-derived flat-pack shapes
- Technical polyester in vivid or neutral colors for Pleats Please

MAISON MIHARA YASUHIRO (MMY):
- Deconstructed/reconstructed vintage sneakers — peeling rubber soles intentionally
- Patchwork, exposed layers, past-future distressed aesthetic

BALENCIAGA (Demna era):
- Extreme proportions: XXXXXL silhouettes, deliberately distressed Triple S, Speed Trainer sock shoe
- Hourglass coat silhouette, Le Cagole XS bag (western hardware), Knife boots
- Often political text or logo-heavy on simple garments

OFF-WHITE (Virgil Abloh):
- Industrial zip ties as accessories, yellow "QUOTE MARKS" on everything
- Diagonal arrows, industrial belt print detailing, 1-9 numbering system
- Carabiner clips as hardware, see-through industrial materials

STONE ISLAND:
- Removable compass badge patch on LEFT sleeve (key identifier)
- Technical outerwear: garment-dyed, reflective, thermo-sensitive, wax-coated
- Logo ONLY on the badge — never woven into the garment

FEAR OF GOD / ESSENTIALS:
- Boxy dropped-shoulder silhouette, elongated sleeves past wrists
- Neutral palette: cream, oatmeal, light grey, dark brown, black, fog
- ESSENTIALS: rubber 3D text logo on chest or chest+back

ACNE STUDIOS:
- Minimal Scandinavian tailoring, clean lines, oversized proportions
- Face-with-pink-cheeks emoji logo on small leather accessories
- Thin face pin on knitwear as subtle tag

BOTTEGA VENETA:
- Intrecciato woven leather — wide-weave strips (no visible logo by design — this IS the signature)
- Cassette bag (padded woven), Jodie bag (hobo knot), Sardine bag
- Puddle boots (shiny rounded rubber), mule slides

CELINE (Hedi Slimane era):
- Slim rock-and-roll 70s silhouettes, clean double-C logo on simple garments
- Leather biker jackets, slim cigarette trousers, logo tees

LOEWE (Jonathan Anderson):
- Anagram stacked-L logo, ultra-premium leather craft
- Puzzle bag (geometric leather panels), Flamenco, Gate, Hammock
- Artisanal unexpected materials: ceramic buttons, wicker, craft references
- Pixelated anagram print garments

CHROME HEARTS:
- Heavy sterling silver jewelry: cross, fleur-de-lis, dagger motifs
- Black leather with embroidered CH cross patches
- Gothic typography on all branding, matte black hardware

AMIRI:
- Distressed luxury denim: MX1 (crystal side-stripe), bandana patchwork
- Bones print, LA rock-and-roll aesthetic, crystal embellishment

PALACE:
- Tri-ferg (triangle-P logo), neon technicolor, British skate culture
- Retro sportswear shapes, loud graphics, Adidas collabs

SUPREME:
- Box logo is key identifier — red rectangle with white Futura text
- Skate-adjacent, often bold-graphic hoodies/tees/accessories

BUY LOCATION RULES — match platform to brand tier precisely:
- Ultra luxury (Bottega, Loewe, Celine, Margiela, Rick Owens): ["Farfetch", "SSENSE", "Grailed"]
- Avant-garde designer (CDG, Yohji, Ann D, Issey): ["SSENSE", "Grailed", "Farfetch"]
- High-end streetwear (Off-White, Stone Island, Fear of God): ["SSENSE", "Grailed", "StockX"]
- Designer sneakers/footwear: ["StockX", "GOAT", "Grailed"]
- Vintage/truly unbranded: ["Grailed", "Depop", "eBay"]
- Mass market (Zara, H&M, ASOS level): ["ASOS", "Zara", "eBay"]

SEARCH QUERY RULES:
- searchQuery: Detailed for Google Shopping. Format: "[Brand] [Specific model or item name] [key visual descriptor] [color]"
  Good: "Rick Owens Bauhaus jacket black leather asymmetric"
  Bad: "black jacket" or "Rick Owens SS2024 Geth Blistered Leather Phlegethon Jacket In Milk Pearl" (too specific)
- retailSearchQuery: SHORT on-site search (MAX 4 WORDS). Format: "[Brand] [category] [1 descriptor]"
  Good: "Rick Owens leather jacket" | "Margiela Tabi boots" | "CDG heart cardigan"
  Bad: "Rick Owens Bauhaus asymmetric leather jacket black 2023 SS" (will return no results)

COORDINATE RULES (CRITICAL):
- You MUST use standard computer vision coordinates: (0,0) is the absolute TOP-LEFT corner of the image.
- posX: 0 is the far LEFT edge, 100 is the far RIGHT edge.
- posY: 0 is the literal TOP edge, 100 is the literal BOTTOM edge.
- Example: A hat or face is always posY=5 to 15. A shirt/chest is always posY=20 to 45. A belt is always posY=50. Shoes/sneakers are always posY=85 to 95.
- ANY output where a shirt has a HIGHER posY than pants represents a fatal coordinate inversion. Do not invert Cartesian space! Top is 0, Bottom is 100.

Extract 1-8 visible fashion items. For every item, commit to your best brand identification and document your visual reasoning in brandIdentifiedBy.`;

app.post('/analyze', analyzeLimiter, async (req, res) => {
  const { image, mimeType } = req.body;

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid base64 image' });
  }

  console.log(`[analyze] ${new Date().toISOString()} — Analyzing image...`);

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [
        {
          name: 'record_fashion_items',
          description: 'Record all fashion products visible in the image with precise identification and sourcing data.',
          input_schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      description: 'e.g. Outerwear, Knitwear, Trousers, Footwear, Bag, Accessory, Jewellery',
                    },
                    name: {
                      type: 'string',
                      description: 'Exact product name if known (e.g. "Ramones Sneaker"), or a short 2-3 word summary if generic (e.g. "Wide Leg Jeans"). DO NOT output long descriptions.',
                    },
                    brand: {
                      type: 'string',
                      description: 'MUST BE ONLY THE BRAND NAME. NO DESCRIPTIONS. e.g. "Acne Studios" or "Rick Owens". If completely unidentifiable, output "".',
                    },
                    brandIdentifiedBy: {
                      type: 'string',
                      description: 'Brief explanation of HOW you identified the brand. e.g. "Chunky Ramones crepe sole + elongated drop-crotch silhouette + matte washed leather — classic Rick Owens DNA." Forces precise visual reasoning.',
                    },
                    description: {
                      type: 'string',
                      description: 'Vivid visual description: cut, fabric texture, colour, key details, hardware, construction notes.',
                    },
                    priceMin: { type: 'number' },
                    priceMax: { type: 'number' },
                    currency: { type: 'string', description: 'Always USD' },
                    buyLocations: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Exactly 3 platforms matched to brand tier. Luxury/Designer: Farfetch, SSENSE, Grailed. Sneakers: StockX, GOAT, Grailed. Vintage: Grailed, Depop, eBay.',
                    },
                    posY: {
                      type: 'number',
                      description: 'Vertical center of THIS item as % from TOP (0=top, 100=bottom). Hat~8, chest~28, belt~50, knee~65, shoe~92. Items must differ by at least 10 from adjacent items.',
                    },
                    posX: {
                      type: 'number',
                      description: 'Horizontal center of THIS item as % from LEFT (0=left, 100=right). Center items: 45-55%. Left-side bag: 25-40%. Right-side: 60-75%.',
                    },
                    boundingBox: {
                      type: 'array',
                      items: { type: 'number' },
                      description: 'A precise bounding box tracking the exact geometry of the clothing item. MUST be an array of exactly 4 integers [ymin, xmin, ymax, xmax] mapped to a 0-1000 scale (where 0 is top/left, 1000 is bottom/right).',
                    },
                    searchQuery: {
                      type: 'string',
                      description: 'The ultimate Google Shopping query to find THIS EXACT ITEM. [Brand] + [Name] + [1 key color/detail]. MAXIMUM 5 WORDS. e.g. "Acne Studios 1989 jeans blue".',
                    },
                    retailSearchQuery: {
                      type: 'string',
                      description: 'ULTRA SHORT on-site retail search. MAX 3 WORDS. Only [Brand] + [Category]. e.g. "Rick Owens jacket". Do not include fit or color.',
                    },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                  },
                  required: [
                    'category', 'name', 'brand', 'brandIdentifiedBy', 'description',
                    'priceMin', 'priceMax', 'currency', 'buyLocations',
                    'posY', 'posX', 'boundingBox', 'searchQuery', 'retailSearchQuery', 'confidence',
                  ],
                },
              },
            },
            required: ['items'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'record_fashion_items' },
      system: FASHION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: 'Identify all clothing and fashion products visible. Use your full visual brand recognition knowledge — examine silhouette, construction, fabric and hardware carefully. Call the tool to record each detected item.',
            },
          ],
        },
      ],
    });

    const toolUse = msg.content.find(c => c.type === 'tool_use');
    if (!toolUse || !toolUse.input || !toolUse.input.items) {
      throw new Error('AI failed to return fashion metadata array');
    }
    
    // Exact lens searching is now handled independently via /lens-search by the frontend!
    res.json({ ok: true, result: JSON.stringify(toolUse.input.items) });
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// ─── Product Image (Google Shopping thumbnail) ────────────────────────────────

app.post('/product-image', async (req, res) => {
  try {
    const { query, fallbackQuery } = req.body;
    if (!query && !fallbackQuery) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const { searchProductImage } = require('./scraper');
    const imageUrl = await searchProductImage(query, fallbackQuery);

    res.json({ imageUrl });
  } catch (err) {
    console.error('[product-image] error:', err.message);
    res.json({ imageUrl: '' });
  }
});

// Dedicated visual search route for cropped thumbnails
app.post('/lens-search', async (req, res) => {
  try {
    const { image } = req.body; // Base64 crop received from frontend
    if (!image) throw new Error('No image provided');

    const { searchGoogleLens } = require('./scraper');
    const exactLink = await searchGoogleLens(image);

    res.json({ exactLink });
  } catch (err) {
    console.error('[lens-search] fallback:', err.message);
    res.json({ exactLink: '' });
  }
});

app.listen(PORT, () => {
  console.log(`What fit is this backend running on port ${PORT}`);
});

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function uploadToCatbox(base64Data) {
    console.log('[LENS] Uploading crop to Catbox via curl...');
    const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    
    const tempPath = path.join(__dirname, 'temp_crop_' + Date.now() + '.jpg');
    fs.writeFileSync(tempPath, buffer);
    
    try {
        const url = execSync(`curl -s -F "reqtype=fileupload" -F "fileToUpload=@${tempPath}" https://catbox.moe/user/api.php`, { encoding: 'utf-8' });
        fs.unlinkSync(tempPath);
        console.log('[LENS] Upload successful:', url.trim());
        return url.trim();
    } catch (err) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        console.error('[LENS] catbox curl err:', err.message);
        return '';
    }
}

async function searchGoogleLens(base64Image) {
    if (!base64Image) return '';
    
    try {
        const catboxUrl = await uploadToCatbox(base64Image);
        if (!catboxUrl || !catboxUrl.startsWith('http')) throw new Error('Upload failed');
        
        // Return the exact Google Lens deep-link for this specific physical crop
        return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(catboxUrl)}`;
    } catch (err) {
        console.error('[LENS] Direct upload pipeline failed:', err.message);
        return '';
    }
}

// ─── Product Image Search (Google Shopping thumbnails) ────────────────────────

const google = require('googlethis');

async function searchProductImage(query, fallbackQuery) {
    if (!query && !fallbackQuery) return '';

    const attempts = [query, fallbackQuery].filter(Boolean);

    for (const q of attempts) {
        try {
            console.log(`[PRODUCT-IMG] Searching Google Shopping for: "${q}"`);
            const response = await google.search(q, {
                page: 0,
                safe: false,
                parse_ads: false,
                additional_params: { tbm: 'shop' },
            });

            // Google Shopping results have thumbnails
            if (response.results && response.results.length > 0) {
                // Try to find a result with a thumbnail or image
                for (const result of response.results) {
                    const imgUrl = result.thumbnail || result.image || '';
                    if (imgUrl && imgUrl.startsWith('http')) {
                        console.log(`[PRODUCT-IMG] Found image for "${q}":`, imgUrl.substring(0, 80) + '...');
                        return imgUrl;
                    }
                }
            }

            // Fallback: try regular image search
            console.log(`[PRODUCT-IMG] No shopping thumbnails for "${q}", trying image search...`);
            const imgResponse = await google.image(q, { safe: false });
            if (imgResponse && imgResponse.length > 0) {
                const imgUrl = imgResponse[0].url || imgResponse[0].origin?.website?.url || '';
                if (imgUrl && imgUrl.startsWith('http')) {
                    console.log(`[PRODUCT-IMG] Found via image search:`, imgUrl.substring(0, 80) + '...');
                    return imgUrl;
                }
            }

            console.log(`[PRODUCT-IMG] No results for "${q}", trying next query...`);
        } catch (err) {
            console.error(`[PRODUCT-IMG] Search failed for "${q}":`, err.message);
        }
    }

    return '';
}

module.exports = { searchGoogleLens, searchProductImage };

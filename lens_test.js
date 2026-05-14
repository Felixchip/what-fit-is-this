const axios = require('axios');
const fs = require('fs');

async function testLens() {
  try {
    console.log('Using sample image url...');
    const targetUrl = encodeURIComponent('https://images.unsplash.com/photo-1591047139829-d91aecb6caea?ixlib=rb-4.0.3');
    
    console.log('Requesting Google Lens...');
    const response = await axios.get(`https://lens.google.com/uploadbyurl?url=${targetUrl}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    const html = response.data;
    
    // Check if we can find product links. Lens usually renders data in <script> tags or a specific JSON blob.
    // It's notoriously difficult.
    fs.writeFileSync('./lens_test.html', html);
    console.log('Saved to lens_test.html. Size:', html.length);
    
    // Look for http links in the raw HTML that might be products
    const links = html.match(/https?:\/\/[^\s"']+/g) || [];
    const uniqueLinks = [...new Set(links)];
    console.log('Found links:', uniqueLinks.length);
    
  } catch (error) {
    console.error('Failed:', error.message);
  }
}

testLens();

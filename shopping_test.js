const google = require('googlethis');

async function testSearch() {
  const options = {
    page: 0, 
    safe: false,
    parse_ads: false, 
    additional_params: {
      tbm: 'shop'
    }
  };

  const query = 'Acne Studios 1989 loose fit jeans light blue';
  console.log(`Searching for: ${query}`);
  try {
    const response = await google.search(query, options);
    console.log('Results length:', response.results.length);
    if(response.results.length > 0) {
      console.log('First result:', response.results[0]);
    } else {
      console.log('No shopping results found using standard search, trying knowledge graph...');
      console.log(response.knowledge_panel);
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
}

testSearch();

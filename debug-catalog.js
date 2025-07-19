// Quick debug script to test catalog API directly
const fetch = require('node-fetch');

async function testCatalogAPI() {
  const domain = 'fcxdemo.okta.com';
  const apiToken = process.env.OKTA_API_TOKEN;
  
  console.log('🔍 Testing IGA Catalog API directly...');
  console.log('Domain:', domain);
  console.log('API Token:', apiToken ? 'Present' : 'Missing');
  
  const url = `https://${domain}/governance/api/v2/my/catalogs/default/entries?filter=status eq "ACTIVE"&limit=50`;
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `SSWS ${apiToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Okta-AI-Dashboard/1.0'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Success! Data length:', data?.length || 0);
      
      if (Array.isArray(data) && data.length > 0) {
        console.log('📋 Sample entry:', JSON.stringify(data[0], null, 2));
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Failed:', errorText);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCatalogAPI();
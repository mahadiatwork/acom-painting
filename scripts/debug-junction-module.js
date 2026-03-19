// Debug script to check junction module data structure
// Run: node debug-junction-module.js

const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function debugJunctionModule() {
  try {
    // Get access token
    const accessTokenUrl = process.env.ZOHO_ACCESS_TOKEN_URL;
    let token;
    
    if (accessTokenUrl) {
      const response = await axios.get(accessTokenUrl);
      token = response.data.access_token || response.data.crmAPIResponse?.body?.access_token;
      if (token && typeof token === 'string' && token.startsWith('Zoho-oauthtoken ')) {
        token = token.replace('Zoho-oauthtoken ', '');
      }
    }

    if (!token) {
      console.error('❌ Failed to get access token');
      return;
    }

    const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';

    // Fetch junction module data
    console.log('🔍 Fetching junction module data...\n');
    const response = await axios.get(`${apiDomain}/crm/v2/Portal_Us_X_Job_Ticke`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      params: { fields: 'Contractors,Projects,Name' }
    });

    const connections = response.data.data || [];
    console.log(`✅ Found ${connections.length} connection records\n`);

    if (connections.length === 0) {
      console.log('⚠️  No connections found. Make sure you have records in the Portal_Us_X_Job_Ticke module.');
      return;
    }

    // Show first record structure
    console.log('📋 First record structure:');
    console.log(JSON.stringify(connections[0], null, 2));
    console.log('\n');

    // Show all records summary
    console.log('📊 All records summary:');
    connections.forEach((conn, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  Name: ${conn.Name || 'N/A'}`);
      console.log(`  Contractors:`, conn.Contractors ? JSON.stringify(conn.Contractors) : 'N/A');
      console.log(`  Projects:`, conn.Projects ? JSON.stringify(conn.Projects) : 'N/A');
      
      // Check for alternative field names
      const keys = Object.keys(conn);
      console.log(`  All keys:`, keys.join(', '));
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

debugJunctionModule();


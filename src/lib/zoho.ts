import axios from 'axios';

class ZohoClient {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private refreshToken: string | undefined;
  private apiDomain: string;
  private accessTokenUrl: string | undefined;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
    this.accessTokenUrl = process.env.ZOHO_ACCESS_TOKEN_URL;
  }

  private async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // 1. Try Custom Function Auth (Prioritized)
      if (this.accessTokenUrl) {
        const response = await axios.get(this.accessTokenUrl);
        // The structure depends on how the Deluge function returns it. 
        // Based on setup guide: { "access_token": "..." }
        // If wrapped in crmAPIResponse: response.data.crmAPIResponse.body.access_token
        
        let token = response.data.access_token;
        if (!token && response.data.crmAPIResponse?.body?.access_token) {
           token = response.data.crmAPIResponse.body.access_token;
        }

        if (token) {
          this.accessToken = token;
          this.tokenExpiry = Date.now() + 3500 * 1000; // Assume 1 hour minus buffer
          return this.accessToken;
        }
      }

      // 2. Fallback to Standard OAuth Refresh Flow
      if (this.clientId && this.refreshToken && this.clientSecret) {
        const params = new URLSearchParams({
          refresh_token: this.refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token'
        });

        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        
        if (response.data.access_token) {
          this.accessToken = response.data.access_token;
          this.tokenExpiry = Date.now() + (response.data.expires_in_sec * 1000) - 60000;
          return this.accessToken;
        }
      }

      throw new Error('Failed to retrieve Zoho access token: Missing credentials or URL');

    } catch (error) {
      console.error('Zoho Token Error:', error);
      throw error;
    }
  }

  async getDeals() {
    try {
      // Mock Data if no credentials at all
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        console.warn('Zoho credentials not set, returning mock data');
        return [
          { id: '101', Deal_Name: 'Mock Deal 1', Account_Name: { name: 'Mock Account' } }
        ];
      }

      const token = await this.getAccessToken();
      
      // Fetch active deals
      // In Zoho, you might filter by stage, e.g., view_id or cvid if you have a custom view
      const response = await axios.get(`${this.apiDomain}/crm/v2/Deals`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        },
        params: {
            // Optional: fetch only necessary fields to reduce payload
            fields: 'id,Deal_Name,Account_Name,Stage,Pipeline'
        }
      });
      
      return response.data.data;
    } catch (error) {
      console.error('Zoho API Error (getDeals):', error);
      throw error;
    }
  }

  async createTimeEntry(data: any) {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        console.log('Zoho credentials not set, mock creation');
        return { id: 'mock-id-123' };
      }

      const token = await this.getAccessToken();
      const response = await axios.post(`${this.apiDomain}/crm/v2/Time_Entries`, {
        data: [data]
      }, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      });
      return response.data.data[0];
    } catch (error) {
      console.error('Zoho API Error (createTimeEntry):', error);
      throw error;
    }
  }
}

export const zohoClient = new ZohoClient();

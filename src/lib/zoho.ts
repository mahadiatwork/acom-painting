import axios from 'axios';

// This is a simplified Zoho Client implementation
// In a real production app, you would handle OAuth token refresh logic here
// For now, we will assume valid tokens or simple API key usage if applicable,
// but Zoho CRM strictly uses OAuth 2.0.

class ZohoClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private apiDomain: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID!;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET!;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN!;
    this.apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
  }

  private async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      // Refresh token flow
      const params = new URLSearchParams({
        refresh_token: this.refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      });

      const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
      
      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        // Zoho tokens usually last 1 hour, set expiry a bit earlier to be safe
        this.tokenExpiry = Date.now() + (response.data.expires_in_sec * 1000) - 60000;
        return this.accessToken;
      } else {
        throw new Error('Failed to refresh access token');
      }
    } catch (error) {
      console.error('Zoho Token Refresh Error:', error);
      throw error;
    }
  }

  async getDeals() {
    try {
      // Logic for demo/dev if no creds are set, return mock data or empty array
      if (!this.clientId || !this.refreshToken) {
        console.warn('Zoho credentials not set, returning mock data');
        return [
          { id: '101', Deal_Name: 'Mock Deal 1', Account_Name: { name: 'Mock Account' } }
        ];
      }

      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiDomain}/crm/v2/Deals`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('Zoho API Error:', error);
      throw error;
    }
  }

  async createTimeEntry(data: any) {
    try {
      if (!this.clientId || !this.refreshToken) {
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
      console.error('Zoho API Error:', error);
      throw error;
    }
  }
}

export const zohoClient = new ZohoClient();


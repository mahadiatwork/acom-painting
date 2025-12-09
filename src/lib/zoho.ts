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
      if (this.accessTokenUrl) {
        const response = await axios.get(this.accessTokenUrl);
        let token = response.data.access_token;
        if (!token && response.data.crmAPIResponse?.body?.access_token) {
           token = response.data.crmAPIResponse.body.access_token;
        }

        if (token) {
          // Strip prefix if present (some Zoho functions return it with prefix)
          if (typeof token === 'string' && token.startsWith('Zoho-oauthtoken ')) {
            token = token.replace('Zoho-oauthtoken ', '');
          }
          this.accessToken = token;
          this.tokenExpiry = Date.now() + 3500 * 1000;
          return this.accessToken;
        }
      }

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
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        console.warn('Zoho credentials not set, returning mock data');
        return [
          { id: '101', Deal_Name: 'Mock Deal 1', Account_Name: { name: 'Mock Account' } }
        ];
      }

      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiDomain}/crm/v2/Deals`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: {
            fields: 'id,Deal_Name,Account_Name,Stage,Pipeline,Shipping_Street,Owner,Supplier_Color,Trim_Coil_Color,Shingle_Accessory_Color,Gutter_Types,Siding_Style'
        }
      });
      return response.data.data;
    } catch (error) {
      console.error('Zoho API Error (getDeals):', error);
      throw error;
    }
  }

  async getPortalUsers() {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) return [];
      const token = await this.getAccessToken();
      const response = await axios.get(`${this.apiDomain}/crm/v2/Portal_Users`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'id,Email,Full_Name' }
      });
      return response.data.data;
    } catch (error) {
      console.error('Zoho API Error (getPortalUsers):', error);
      return [];
    }
  }

  async getUserJobConnections() {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) return [];
      const token = await this.getAccessToken();
      // Fetch from the new junction module: Portal_Us_X_Job_Ticke
      const response = await axios.get(`${this.apiDomain}/crm/v2/Portal_Us_X_Job_Ticke`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'Contractors,Projects,Name' } 
      });
      return response.data.data;
    } catch (error) {
      console.error('Zoho API Error (getUserJobConnections):', error);
      return [];
    }
  }

  async createTimeEntry(data: any) {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        return { id: 'mock-id-123' };
      }
      const token = await this.getAccessToken();
      const response = await axios.post(`${this.apiDomain}/crm/v2/Time_Entries`, {
        data: [data]
      }, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      return response.data.data[0];
    } catch (error) {
      console.error('Zoho API Error (createTimeEntry):', error);
      throw error;
    }
  }
}

export const zohoClient = new ZohoClient();

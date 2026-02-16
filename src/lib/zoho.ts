import axios from 'axios';
import { getUserTimezoneOffset } from './timezone';

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
            fields: 'id,Deal_Name,Stage,Closing_Date,Project_Start_Date,Shipping_Street,Single_Line_1,Single_Line_2,State,Zip_Code'
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

  /** Fetch all Painters from Zoho CRM (for crew dropdown and cron sync) */
  async getPainters(): Promise<{ id: string; Name?: string; Email?: string; Phone?: string; Active?: boolean }[]> {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) return [];
      const token = await this.getAccessToken();
      const moduleName = process.env.ZOHO_PAINTERS_MODULE_NAME || 'Painters';
      const response = await axios.get(`${this.apiDomain}/crm/v2/${moduleName}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'id,Name,Email,Phone,Active' },
      });
      return response.data.data || [];
    } catch (error: any) {
      console.error('Zoho API Error (getPainters):', error?.message || error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('[Zoho] getPainters response:', error.response.status, error.response.data);
      }
      return [];
    }
  }

  async getUserJobConnections() {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) return [];
      const token = await this.getAccessToken();
      // Fetch from the junction module
      // NOTE: Update the module name below if it's different from Portal_Us_X_Job_Ticke
      // Common alternatives: Contractor_X_Jobs, Portal_Users_X_Job_Tickets, etc.
      const moduleName = process.env.ZOHO_JUNCTION_MODULE_NAME || 'Portal_Us_X_Job_Ticke';
      const response = await axios.get(`${this.apiDomain}/crm/v2/${moduleName}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: { fields: 'Contractors,Projects,Name' } 
      });
      return response.data.data;
    } catch (error: any) {
      console.error('Zoho API Error (getUserJobConnections):', error);
      // Log the error details to help debug
      if (axios.isAxiosError(error) && error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Formats a date and time string into Zoho DateTime format with timezone
   * Format: 2020-12-09T17:25:24-07:00
   * 
   * @param date - Date string in YYYY-MM-DD format
   * @param time - Time string in HH:MM format
   * @param timezone - Timezone offset in -07:00 or +05:30 format
   * @returns Formatted DateTime string for Zoho CRM
   */
  private formatZohoDateTime(date: string, time: string, timezone: string): string {
    // Zoho requires format: yyyy-MM-ddTHH:mm:ss±HH:mm
    // Example: "2026-01-21T05:06:00-07:00"
    
    // Ensure time is in HH:MM format (24-hour)
    // Remove any AM/PM if present and convert to 24-hour
    let normalizedTime = time.trim();
    
    // If time includes AM/PM, convert to 24-hour format
    const isPM = normalizedTime.toUpperCase().includes('PM');
    const isAM = normalizedTime.toUpperCase().includes('AM');
    
    if (isPM || isAM) {
      // Remove AM/PM
      normalizedTime = normalizedTime.replace(/[AaPp][Mm]/g, '').trim();
      const [hours, minutes] = normalizedTime.split(':').map(Number);
      
      if (isPM && hours !== 12) {
        normalizedTime = `${String(hours + 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      } else if (isAM && hours === 12) {
        normalizedTime = `00:${String(minutes).padStart(2, '0')}`;
      } else {
        normalizedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }
    
    // Ensure timezone has correct format (±HH:mm)
    // timezone should already be in format like "-07:00" or "+05:30"
    const formatted = `${date}T${normalizedTime}:00${timezone}`;
    
    console.log(`[Zoho] Formatting DateTime: date=${date}, time=${time} -> normalized=${normalizedTime}, timezone=${timezone}, result=${formatted}`);
    
    return formatted;
  }

  /**
   * Create parent Time_Entries record only (Foreman-based model).
   * No per-painter time fields; those go in Time_Entries_X_Painters.
   */
  async createTimeEntryParent(data: {
    projectId: string;
    foremanId: string;   // Portal User ID
    date: string;        // YYYY-MM-DD
    notes?: string;
    sundryItems?: Record<string, number>;
  }): Promise<{ id: string }> {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        return { id: 'mock-id-123' };
      }
      const token = await this.getAccessToken();
      const entryName = `Timesheet - ${data.date}`;
      const zohoPayload: Record<string, any> = {
        Name: entryName,
        Job: { id: data.projectId },
        Portal_User: { id: data.foremanId },
        Date: data.date,
        Time_Entry_Note: data.notes || '',
      };
      if (data.sundryItems) {
        Object.entries(data.sundryItems).forEach(([apiName, quantity]) => {
          if (quantity > 0) zohoPayload[apiName] = quantity;
        });
      }
      console.log('[Zoho] Creating time entry parent:', JSON.stringify(zohoPayload, null, 2));
      const response = await axios.post(
        `${this.apiDomain}/crm/v2/Time_Entries`,
        { data: [zohoPayload] },
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      console.log('[Zoho] Time entry parent created:', response.data?.data?.[0]?.id);
      return response.data.data[0];
    } catch (error: any) {
      console.error('[Zoho] API Error (createTimeEntryParent):', error?.message || error);
      if (error?.response) {
        console.error('[Zoho] Error response:', error.response.status, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Create one record in Time_Entries_X_Painters junction module.
   */
  async createTimesheetPainterEntry(data: {
    zohoTimeEntryId: string;
    painterId: string;
    date: string;
    startTime: string;
    endTime: string;
    lunchStart?: string;
    lunchEnd?: string;
    totalHours: string;
    timezone: string;
  }): Promise<{ id: string }> {
    try {
      if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
        return { id: 'mock-junction-123' };
      }
      const token = await this.getAccessToken();
      const startDateTime = this.formatZohoDateTime(data.date, data.startTime, data.timezone);
      const endDateTime = this.formatZohoDateTime(data.date, data.endTime, data.timezone);
      const zohoPayload: Record<string, any> = {
        Time_Entry: { id: data.zohoTimeEntryId },
        Painter: { id: data.painterId },
        Start_Time: startDateTime,
        End_Time: endDateTime,
        Total_Hours: data.totalHours,
      };
      if (data.lunchStart && data.lunchEnd) {
        zohoPayload.Lunch_Start = this.formatZohoDateTime(data.date, data.lunchStart, data.timezone);
        zohoPayload.Lunch_End = this.formatZohoDateTime(data.date, data.lunchEnd, data.timezone);
      }
      const moduleName = process.env.ZOHO_TE_PAINTERS_MODULE_NAME || 'Time_Entries_X_Painters';
      const response = await axios.post(
        `${this.apiDomain}/crm/v2/${moduleName}`,
        { data: [zohoPayload] },
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      return response.data.data[0];
    } catch (error: any) {
      console.error('[Zoho] API Error (createTimesheetPainterEntry):', error?.message || error);
      if (error?.response) {
        console.error('[Zoho] Junction error:', error.response.status, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

export const zohoClient = new ZohoClient();

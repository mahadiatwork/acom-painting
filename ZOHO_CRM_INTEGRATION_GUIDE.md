# Zoho CRM Integration Guide

Complete step-by-step guide for integrating Zoho CRM v7 API into your Next.js/Node.js application, based on production-ready implementation patterns.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Zoho Client Implementation](#zoho-client-implementation)
4. [Authentication & Token Management](#authentication--token-management)
5. [Common Operations](#common-operations)
6. [Related Records](#related-records)
7. [Search & Query](#search--query)
8. [Field Mapping & Data Transformation](#field-mapping--data-transformation)
9. [Bidirectional Sync Patterns](#bidirectional-sync-patterns)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required
- **Zoho CRM Account** with API access enabled
- **Zoho CRM API Access Token Endpoint** - A REST API that returns a valid OAuth access token
- **Node.js/Next.js Project** 
- **axios** package installed

### Optional but Recommended
- **Zoho CRM Developer Account** for testing
- Understanding of Zoho CRM module structure and field names

### Install Dependencies

```bash
npm install axios
# or
yarn add axios
```

---

## Environment Setup

### 1. Environment Variables

Create a `.env.local` file in your project root:

```env
# Zoho CRM Configuration
ACCESSTOKEN_URL=https://your-api-endpoint.com/get-access-token
# Alternative: ZOHO_ACCESS_TOKEN_URL (for backward compatibility)

# Zoho CRM Datacenter (optional, defaults to com.au)
ZOHO_DATACENTER=com.au
# Options: com, com.au, eu, in, jp, etc.
```

### 2. Access Token API Format

Your access token API endpoint should return one of these formats:

**Option 1: Simple format**
```json
{
  "access_token": "1000.abc123...xyz789",
  "expires_in": 3600
}
```

**Option 2: Zoho Functions format**
```json
{
  "details": {
    "output": "1000.abc123...xyz789"
  }
}
```

**Option 3: Direct output**
```json
{
  "output": "1000.abc123...xyz789"
}
```

**Option 4: Plain string**
```
"1000.abc123...xyz789"
```

---

## Zoho Client Implementation

### Create the Zoho Client Class

Create `src/lib/zohoClient.js`:

```javascript
import axios from 'axios';

class ZohoCRMClient {
  constructor() {
    // Configure datacenter (defaults to com.au for Australia)
    const datacenter = process.env.ZOHO_DATACENTER || 'com.au';
    this.baseURL = `https://www.zohoapis.${datacenter}/crm/v7`;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenCacheDuration = 50 * 60 * 1000; // 50 minutes cache
    
    console.log(`🌍 Zoho CRM configured: ${this.baseURL} (datacenter: ${datacenter})`);
  }

  // Token management (see next section)
  async getAccessToken(forceRefresh = false) { /* ... */ }
  
  // Request wrapper (see next section)
  async makeRequest(method, endpoint, data = null, params = null, retryCount = 0) { /* ... */ }
  
  // CRUD operations (see Common Operations section)
  // Search & Query operations (see Search & Query section)
  // Related records operations (see Related Records section)
}

export { ZohoCRMClient };
export default new ZohoCRMClient();
```

---

## Authentication & Token Management

### 1. Get Access Token with Caching

```javascript
async getAccessToken(forceRefresh = false) {
  try {
    // Return cached token if still valid
    if (!forceRefresh && this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      console.log('🔑 Using cached Zoho access token');
      return this.accessToken;
    }

    // Get token URL from environment
    const tokenUrl = process.env.ACCESSTOKEN_URL || process.env.ZOHO_ACCESS_TOKEN_URL;
    if (!tokenUrl) {
      console.warn('⚠️ ACCESSTOKEN_URL not set - Zoho CRM features will be disabled');
      return null; // Don't throw - allow app to continue
    }

    console.log('🔑 Fetching fresh Zoho access token from:', tokenUrl);
    const response = await axios.get(tokenUrl, {
      timeout: 30000, // 30 second timeout
      validateStatus: (status) => status < 500, // Don't throw on 4xx/5xx
    });
    
    // Handle different response formats
    let token = null;
    
    if (response.data.access_token) {
      token = response.data.access_token;
    } else if (response.data.details?.output) {
      token = response.data.details.output;
    } else if (response.data.output) {
      token = response.data.output;
    } else if (typeof response.data === 'string') {
      token = response.data;
    }
    
    // Strip "Zoho-oauthtoken" prefix if present
    if (token && typeof token === 'string') {
      token = token.replace(/^Zoho-oauthtoken\s+/, '');
    }
    
    if (!token) {
      throw new Error('Access token not found in response');
    }
    
    // Cache token
    this.accessToken = token;
    this.tokenExpiry = Date.now() + this.tokenCacheDuration;
    console.log('✅ Zoho access token cached until:', new Date(this.tokenExpiry).toISOString());
    
    return this.accessToken;
  } catch (error) {
    console.error('⚠️ Failed to get Zoho access token:', error.message);
    // Return null instead of throwing to prevent app breaking
    return null;
  }
}
```

### 2. Request Wrapper with Auto-Retry

```javascript
async makeRequest(method, endpoint, data = null, params = null, retryCount = 0) {
  const token = await this.getAccessToken();
  
  // If token is null, return empty result instead of making request
  if (!token) {
    console.warn('⚠️ No Zoho access token available - skipping API request');
    return { data: [] };
  }
  
  const config = {
    method,
    url: `${this.baseURL}${endpoint}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (params) {
    config.params = params;
  }

  if (data && (method === 'post' || method === 'put')) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    // Retry once with fresh token if we get 401 Unauthorized
    if (error.response?.status === 401 && retryCount === 0) {
      console.log('⚠️ Got 401 from Zoho, refreshing token and retrying...');
      const freshToken = await this.getAccessToken(true); // Force refresh
      config.headers.Authorization = `Zoho-oauthtoken ${freshToken}`;
      
      try {
        const retryResponse = await axios(config);
        return retryResponse.data;
      } catch (retryError) {
        console.error('Zoho API Error after retry:', retryError.response?.data || retryError.message);
        throw retryError;
      }
    }
    
    // Extract and log detailed error information
    const zohoError = error.response?.data;
    const statusCode = error.response?.status;
    
    console.error('Zoho API Error:', {
      status: statusCode,
      code: zohoError?.code,
      message: zohoError?.message || error.message,
      details: zohoError?.details || zohoError,
    });
    
    // Create enhanced error
    if (zohoError) {
      const errorMessage = zohoError.message || `Zoho API error: ${zohoError.code || statusCode}`;
      const enhancedError = new Error(errorMessage);
      enhancedError.code = zohoError.code;
      enhancedError.status = statusCode;
      enhancedError.details = zohoError.details || zohoError;
      throw enhancedError;
    }
    
    throw error;
  }
}
```

**Key Points:**
- Token is cached for 50 minutes (tokens typically last 1 hour)
- Auto-retries once on 401 errors with fresh token
- Returns `null` or empty data instead of throwing to prevent app crashes
- Handles multiple response formats from token endpoint

---

## Common Operations

### 1. Get Single Record

```javascript
async getRecord(moduleName, recordId) {
  try {
    const response = await this.makeRequest('get', `/${moduleName}/${recordId}`);
    
    // v7 API returns { data: [{...}] } - get first element
    const record = response.data?.[0] || null;
    
    if (!record) {
      console.warn(`⚠️ No record found for ${moduleName}/${recordId}`);
    }
    
    return record;
  } catch (error) {
    console.error(`Error fetching ${moduleName} record ${recordId}:`, error.message);
    return null; // Return null instead of throwing
  }
}

// Usage
const contact = await zohoClient.getRecord('Contacts', '1234567890001');
```

### 2. Create Record

```javascript
async createRecord(moduleName, recordData) {
  try {
    const response = await this.makeRequest('post', `/${moduleName}`, {
      data: [recordData], // v7 API requires array
    });
    
    // v7 API returns { data: [{...}] } - get first element
    return response.data?.[0] || null;
  } catch (error) {
    console.error(`Error creating ${moduleName} record:`, error.message);
    throw error;
  }
}

// Usage
const newContact = await zohoClient.createRecord('Contacts', {
  First_Name: 'John',
  Last_Name: 'Doe',
  Email: 'john.doe@example.com',
});
```

### 3. Update Record

```javascript
async updateRecord(moduleName, recordId, updateData) {
  try {
    const response = await this.makeRequest('put', `/${moduleName}`, {
      data: [{
        id: recordId,
        ...updateData,
      }],
    });
    
    // v7 API returns { data: [{...}] } - get first element
    return response.data?.[0] || null;
  } catch (error) {
    console.error(`Error updating ${moduleName} record ${recordId}:`, error.message);
    throw error;
  }
}

// Usage
const updated = await zohoClient.updateRecord('Contacts', '1234567890001', {
  Phone: '+1234567890',
});
```

### 4. Delete Record

```javascript
async deleteRecord(moduleName, recordId) {
  try {
    await this.makeRequest('delete', `/${moduleName}/${recordId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting ${moduleName} record ${recordId}:`, error.message);
    throw error;
  }
}
```

---

## Search & Query

### 1. Search by Email (Query Parameter)

```javascript
async searchByEmail(moduleName, email) {
  try {
    const response = await this.makeRequest(
      'get',
      `/${moduleName}/search`,
      null,
      { email } // Query parameter: ?email=user@example.com
    );
    
    // v7 API search returns { data: [...] }
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
      return [];
    }
    throw error;
  }
}

// Usage
const contacts = await zohoClient.searchByEmail('Contacts', 'user@example.com');
const contact = contacts[0] || null;
```

### 2. Search with Criteria

```javascript
async searchRecords(moduleName, criteria) {
  try {
    const response = await this.makeRequest(
      'get',
      `/${moduleName}/search`,
      null,
      { criteria } // Query parameter: ?criteria=((Email:equals:user@example.com))
    );
    
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
      return [];
    }
    throw error;
  }
}

// Usage
// Search for contacts with specific phone
const contacts = await zohoClient.searchRecords(
  'Contacts',
  '((Phone:equals:+1234567890))'
);
```

### 3. COQL Query (Advanced)

```javascript
async coqlQuery(selectQuery) {
  try {
    const token = await this.getAccessToken();
    const config = {
      method: 'post',
      url: `${this.baseURL}/coql`,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        select_query: selectQuery,
      },
    };
    const response = await axios(config);
    return response.data.data || [];
  } catch (error) {
    if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
      return [];
    }
    console.error('COQL query error:', error.message);
    throw error;
  }
}

// Usage
const records = await zohoClient.coqlQuery(
  "SELECT First_Name, Last_Name, Email FROM Contacts WHERE Email = 'user@example.com' LIMIT 200"
);
```

### 4. Find Contact by Email Helper

```javascript
async findContactByEmail(email) {
  try {
    console.log(`🔍 Searching for contact with email: ${email}`);
    const contacts = await this.searchByEmail('Contacts', email);
    console.log(`📋 Search returned ${contacts.length} contact(s)`);
    
    if (contacts.length > 0) {
      console.log('✅ Contact found:', contacts[0].id);
      return contacts[0];
    }
    
    console.log('📭 No contacts found');
    return null;
  } catch (error) {
    console.error(`❌ Error finding contact by email ${email}:`, error.message);
    return null; // Return null instead of throwing
  }
}
```

---

## Related Records

### 1. Get Related Records

```javascript
async getRelatedRecords(moduleName, recordId, relatedListName, fields = null) {
  try {
    // Determine fields based on related list type if not provided
    if (!fields) {
      if (relatedListName === 'Partner_Dependents') {
        fields = 'id,First_Name,Name,Relationship_to_Applicant,Date_of_Birth,Gender,Email,Citizenship';
      } else if (relatedListName === 'Deals') {
        fields = 'id,Deal_Name,DealName,Visa_Type,Deal_Stage,Stage,Amount,Closing_Date,Probability,Account_Name,Contact_Name,Owner,Modified_Time,Last_Activity_Time';
      } else {
        fields = 'id'; // Default: get id only
      }
    }
    
    console.log(`🔍 Fetching related records: GET /${moduleName}/${recordId}/${relatedListName}?fields=${fields}`);
    
    const response = await this.makeRequest(
      'get',
      `/${moduleName}/${recordId}/${relatedListName}`,
      null,
      { fields } // Query parameter: ?fields=id,First_Name,Last_Name
    );
    
    // Handle different possible response structures
    let records = [];
    
    if (Array.isArray(response)) {
      records = response;
    } else if (response?.data) {
      if (Array.isArray(response.data)) {
        records = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        records = response.data.data; // Nested structure
      }
    }
    
    console.log(`✅ Found ${records.length} related records in ${relatedListName}`);
    return records;
  } catch (error) {
    if (error.response?.status === 204 || error.response?.data?.code === 'NO_DATA') {
      return [];
    }
    console.error(`❌ Error fetching related records from ${relatedListName}:`, error.message);
    return []; // Return empty array instead of throwing
  }
}

// Usage
// Get all deals for a contact
const deals = await zohoClient.getRelatedRecords('Contacts', '1234567890001', 'Deals');

// Get all dependents for a contact
const dependents = await zohoClient.getRelatedRecords(
  'Contacts',
  '1234567890001',
  'Partner_Dependents',
  'id,First_Name,Last_Name,Relationship_to_Applicant,Date_of_Birth'
);
```

### 2. Create Related Record

```javascript
async createRelatedRecord(moduleName, recordId, relatedListName, relatedData) {
  try {
    const response = await this.makeRequest(
      'post',
      `/${moduleName}/${recordId}/${relatedListName}`,
      {
        data: [relatedData], // v7 API requires array
      }
    );
    return response.data?.[0] || null;
  } catch (error) {
    console.error(`Error creating related record in ${relatedListName}:`, error.message);
    throw error;
  }
}

// Usage
const newDependent = await zohoClient.createRelatedRecord(
  'Contacts',
  '1234567890001',
  'Partner_Dependents',
  {
    First_Name: 'Jane',
    Last_Name: 'Doe',
    Relationship_to_Applicant: 'Spouse',
    Date_of_Birth: '1990-01-01',
  }
);
```

### 3. Update Related Record

```javascript
async updateRelatedRecord(moduleName, recordId, relatedListName, relatedRecordId, updateData) {
  try {
    const response = await this.makeRequest(
      'put',
      `/${moduleName}/${recordId}/${relatedListName}`,
      {
        data: [{
          id: relatedRecordId,
          ...updateData,
        }],
      }
    );
    return response.data?.[0] || null;
  } catch (error) {
    console.error(`Error updating related record in ${relatedListName}:`, error.message);
    throw error;
  }
}
```

### 4. Delete Related Record

```javascript
async deleteRelatedRecord(moduleName, recordId, relatedListName, relatedRecordId) {
  try {
    await this.makeRequest(
      'delete',
      `/${moduleName}/${recordId}/${relatedListName}/${relatedRecordId}`
    );
    return true;
  } catch (error) {
    console.error(`Error deleting related record from ${relatedListName}:`, error.message);
    throw error;
  }
}
```

---

## Field Mapping & Data Transformation

### Common Field Name Conversions

Zoho CRM uses different field naming conventions. Here's how to map them:

```javascript
// Zoho CRM Field Names → Your Application Field Names
const fieldMapping = {
  // Contact fields
  'First_Name': 'firstName',
  'Last_Name': 'lastName',
  'Full_Name': 'fullName',
  'Email': 'email',
  'Phone': 'phone',
  'Mobile': 'mobile',
  'Mailing_Street': 'mailingStreet',
  'Mailing_City': 'mailingCity',
  'Mailing_State': 'mailingState',
  'Mailing_Zip': 'mailingZip',
  'Mailing_Country': 'mailingCountry',
  'Date_of_Birth': 'dateOfBirth',
  
  // Deal/Application fields
  'Deal_Name': 'reference',
  'DealName': 'reference',
  'Visa_Type': 'type',
  'Stage': 'status',
  'Deal_Stage': 'status',
  'Closing_Date': 'closingDate',
  'Amount': 'amount',
  'Probability': 'probability',
  
  // Related records
  'Relationship_to_Applicant': 'relationship',
  'Citizenship': 'citizenship',
};

// Helper function to map Zoho fields to your app structure
function mapZohoFieldsToApp(zohoRecord, mapping) {
  const appRecord = {};
  
  for (const [zohoField, appField] of Object.entries(mapping)) {
    if (zohoRecord[zohoField] !== undefined && zohoRecord[zohoField] !== null) {
      appRecord[appField] = zohoRecord[zohoField];
    }
  }
  
  // Preserve Zoho ID for syncing
  if (zohoRecord.id) {
    appRecord.zohoId = zohoRecord.id;
  }
  
  return appRecord;
}

// Usage
const zohoContact = await zohoClient.getRecord('Contacts', '1234567890001');
const appContact = mapZohoFieldsToApp(zohoContact, fieldMapping);
```

### Handling Complex Fields

```javascript
// Owner field (returns object: { name: "...", id: "...", email: "..." })
function extractOwnerName(ownerField) {
  if (typeof ownerField === 'object' && ownerField !== null) {
    return ownerField.name || ownerField.id || '';
  }
  return ownerField || '';
}

// Contact_Name field in related records
function extractContactName(contactNameField) {
  if (typeof contactNameField === 'object' && contactNameField !== null) {
    return contactNameField.name || contactNameField.id || '';
  }
  return contactNameField || '';
}

// Date parsing
function parseZohoDate(dateString) {
  if (!dateString) return null;
  try {
    return new Date(dateString).toISOString();
  } catch (e) {
    console.warn('Failed to parse date:', dateString);
    return null;
  }
}
```

---

## Bidirectional Sync Patterns

### Pattern 1: Zoho → Firebase Sync (On Login/Page Load)

```javascript
// API Route: app/api/applications/fetch-zoho-deals/route.js
export async function POST(request) {
  try {
    const { userId, zohoContactId } = await request.json();
    const zohoClient = new ZohoCRMClient();
    const db = getAdapter();
    
    // 1. Fetch deals from Zoho
    const deals = await zohoClient.getRelatedRecords('Contacts', zohoContactId, 'Deals');
    
    if (!deals || deals.length === 0) {
      return NextResponse.json({ success: true, deals: [] });
    }
    
    // 2. Load existing applications from Firebase
    const existingApps = await db.loadApplications(userId);
    
    // 3. Sync each deal
    for (const deal of deals) {
      // Check if application exists by zohoId
      const existingApp = existingApps.find(app => app.zohoId === deal.id);
      
      if (existingApp) {
        // Update existing application (preserve questionnaire data)
        await db.updateApplication(existingApp.id, {
          reference: deal.Deal_Name || deal.DealName,
          type: deal.Visa_Type,
          status: deal.Stage || deal.Deal_Stage,
          closingDate: deal.Closing_Date,
          zohoId: deal.id,
          userId: userId,
        }, userId);
      } else {
        // Create new application
        const appId = nanoid(12);
        await db.createApplication({
          id: appId,
          reference: deal.Deal_Name || deal.DealName,
          type: deal.Visa_Type,
          status: deal.Stage || deal.Deal_Stage,
          closingDate: deal.Closing_Date,
          zohoId: deal.id,
          userId: userId,
        }, userId);
      }
    }
    
    return NextResponse.json({ success: true, dealsCount: deals.length });
  } catch (error) {
    console.error('Error syncing deals:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### Pattern 2: Firebase → Zoho Sync (On Update)

```javascript
// When user updates application in portal
async function syncApplicationToZoho(application) {
  try {
    const zohoClient = new ZohoCRMClient();
    
    if (!application.zohoId) {
      console.warn('Application has no zohoId, cannot sync to Zoho');
      return;
    }
    
    // Update the deal in Zoho CRM
    await zohoClient.updateRecord('Deals', application.zohoId, {
      Deal_Name: application.reference,
      Visa_Type: application.type,
      Stage: application.status,
      Closing_Date: application.closingDate,
    });
    
    console.log(`✅ Synced application ${application.id} to Zoho Deal ${application.zohoId}`);
  } catch (error) {
    console.error('❌ Failed to sync application to Zoho:', error.message);
    // Don't throw - allow app to continue
  }
}

// Usage in application update handler
const updateResult = await db.updateApplication(appId, updates);
if (updateResult.success && updates.zohoId) {
  // Sync to Zoho asynchronously (non-blocking)
  syncApplicationToZoho(updateResult.application).catch(err => {
    console.error('Background sync failed:', err);
  });
}
```

### Pattern 3: Prevent Duplicates During Sync

```javascript
// Load all existing records ONCE before the loop
const existingApps = await db.loadApplications(userId);

for (const deal of deals) {
  // Match by zohoId first (primary)
  let existingApp = existingApps.find(app => app.zohoId === deal.id);
  
  // Fallback: Match by reference/type for old apps without zohoId
  if (!existingApp) {
    existingApp = existingApps.find(app => 
      app.reference === deal.Deal_Name && 
      app.type === deal.Visa_Type &&
      !app.zohoId
    );
  }
  
  if (existingApp) {
    // Update existing
    await db.updateApplication(existingApp.id, mappedData, userId);
    // Update local array to prevent duplicate matches
    const index = existingApps.findIndex(app => app.id === existingApp.id);
    existingApps[index] = { ...existingApp, ...mappedData };
  } else {
    // Create new
    const newApp = await db.createApplication(mappedData, userId);
    // Add to local array
    existingApps.push(newApp);
  }
}
```

---

## Error Handling

### Graceful Degradation Pattern

```javascript
// Always return null/empty instead of throwing to prevent app crashes
async getRecord(moduleName, recordId) {
  try {
    const response = await this.makeRequest('get', `/${moduleName}/${recordId}`);
    return response.data?.[0] || null;
  } catch (error) {
    console.error(`Error fetching ${moduleName} record ${recordId}:`, error.message);
    return null; // Don't throw - allow app to continue
  }
}

// Make Zoho operations non-critical
try {
  const contact = await zohoClient.findContactByEmail(user.email);
  if (contact) {
    // Process contact data
  }
} catch (error) {
  console.error('Zoho operation failed (non-critical):', error.message);
  // Continue with app flow even if Zoho is down
}
```

### Error Types to Handle

```javascript
// Handle specific Zoho error codes
if (error.code === 'INVALID_TOKEN') {
  // Refresh token and retry
  await this.getAccessToken(true);
  return this.makeRequest(method, endpoint, data, params, retryCount + 1);
}

if (error.code === 'NO_DATA' || error.status === 204) {
  // No data found - return empty array
  return [];
}

if (error.code === 'INVALID_DATA') {
  // Invalid field values - log and continue
  console.warn('Invalid data:', error.details);
  return null;
}
```

---

## Best Practices

### 1. Always Cache Tokens

```javascript
// Cache tokens for 50 minutes (tokens last 1 hour)
this.tokenCacheDuration = 50 * 60 * 1000;
```

### 2. Use Query Parameters for Searches

```javascript
// ✅ Correct: Use query parameter
GET /Contacts/search?email=user@example.com

// ❌ Wrong: Don't use criteria for email searches
GET /Contacts/search?criteria=((Email:equals:user@example.com))
```

### 3. Always Specify Fields for Related Records

```javascript
// ✅ Correct: Specify fields to avoid getting unnecessary data
const deals = await zohoClient.getRelatedRecords(
  'Contacts',
  contactId,
  'Deals',
  'id,Deal_Name,Visa_Type,Stage,Closing_Date'
);

// ❌ Wrong: Not specifying fields may return incomplete data
const deals = await zohoClient.getRelatedRecords('Contacts', contactId, 'Deals');
```

### 4. Handle Different Response Structures

```javascript
// Zoho API can return data in different formats
let records = [];

if (Array.isArray(response)) {
  records = response;
} else if (response?.data) {
  if (Array.isArray(response.data)) {
    records = response.data;
  } else if (response.data?.data && Array.isArray(response.data.data)) {
    records = response.data.data; // Nested structure
  }
}
```

### 5. Preserve Application Data When Syncing

```javascript
// When updating from Zoho, only update Zoho-related fields
await db.updateApplication(appId, {
  // Zoho fields
  reference: deal.Deal_Name,
  type: deal.Visa_Type,
  status: deal.Stage,
  // Preserve Firebase-only fields (questionnaire answers, notes, etc.)
  // Don't overwrite them!
});
```

### 6. Use zohoId for Matching

```javascript
// Always store zohoId when creating records
const application = {
  id: appId,
  zohoId: deal.id, // Store Zoho ID for future matching
  reference: deal.Deal_Name,
  // ... other fields
};

// Match by zohoId for updates
const existingApp = apps.find(app => app.zohoId === deal.id);
```

### 7. Load Existing Records Once

```javascript
// ✅ Correct: Load once before loop
const existingApps = await db.loadApplications(userId);
for (const deal of deals) {
  const existingApp = existingApps.find(app => app.zohoId === deal.id);
  // ...
}

// ❌ Wrong: Loading inside loop causes duplicates
for (const deal of deals) {
  const existingApps = await db.loadApplications(userId); // Don't do this!
  // ...
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Access token not found in response"

**Problem:** Token endpoint returns unexpected format.

**Solution:** Check token endpoint response format and add handling for it:

```javascript
// Add more response format handlers
if (response.data.token) {
  token = response.data.token;
}
// ... existing handlers
```

#### 2. "401 Unauthorized" errors

**Problem:** Token expired or invalid.

**Solution:** Enable auto-retry with token refresh:

```javascript
if (error.response?.status === 401 && retryCount === 0) {
  const freshToken = await this.getAccessToken(true);
  // Retry request
}
```

#### 3. Related records return empty array

**Problem:** Missing `fields` parameter.

**Solution:** Always specify fields:

```javascript
const deals = await zohoClient.getRelatedRecords(
  'Contacts',
  contactId,
  'Deals',
  'id,Deal_Name,Stage' // Specify fields
);
```

#### 4. Duplicate records created during sync

**Problem:** Loading existing records inside loop.

**Solution:** Load once before loop and track processed records:

```javascript
const existingApps = await db.loadApplications(userId); // Load once

for (const deal of deals) {
  const existingApp = existingApps.find(app => app.zohoId === deal.id);
  // Update local array after processing
}
```

#### 5. Field names don't match

**Problem:** Zoho field names differ from application.

**Solution:** Create field mapping:

```javascript
const fieldMapping = {
  'Deal_Name': 'reference',
  'Stage': 'status',
  // ... more mappings
};
```

---

## Complete Example: Sync Deals to Applications

```javascript
// app/api/applications/fetch-zoho-deals/route.js
import { NextResponse } from 'next/server';
import { ZohoCRMClient } from '@/lib/zohoClient';
import { getAdapter } from '@/lib/adapters';
import { nanoid } from 'nanoid';

export async function POST(request) {
  try {
    const { userId, zohoContactId } = await request.json();
    
    if (!userId || !zohoContactId) {
      return NextResponse.json(
        { success: false, error: 'userId and zohoContactId are required' },
        { status: 400 }
      );
    }

    const zohoClient = new ZohoCRMClient();
    const db = getAdapter();
    
    // 1. Fetch deals from Zoho
    const deals = await zohoClient.getRelatedRecords('Contacts', zohoContactId, 'Deals');
    
    if (!deals || deals.length === 0) {
      return NextResponse.json({
        success: true,
        deals: [],
        message: 'No deals found'
      });
    }

    // 2. Load existing applications ONCE
    const existingApps = await db.loadApplications(userId);
    const syncedApplications = [];

    // 3. Sync each deal
    for (const deal of deals) {
      try {
        // Map deal to application format
        const applicationData = {
          reference: deal.Deal_Name || deal.DealName || '',
          type: deal.Visa_Type || 'Visa Application',
          status: deal.Stage || deal.Deal_Stage || 'Draft',
          closingDate: deal.Closing_Date || '',
          zohoId: deal.id,
          userId: userId,
        };

        // Find existing by zohoId
        let existingApp = existingApps.find(app => app.zohoId === deal.id);
        
        if (existingApp) {
          // Update existing (preserve questionnaire data)
          await db.updateApplication(existingApp.id, applicationData, userId);
          syncedApplications.push({ ...applicationData, id: existingApp.id });
        } else {
          // Create new
          const appId = nanoid(12);
          await db.createApplication({
            id: appId,
            ...applicationData,
          }, userId);
          syncedApplications.push({ ...applicationData, id: appId });
        }
      } catch (dealError) {
        console.error(`Failed to process deal ${deal.id}:`, dealError.message);
        // Continue with other deals
      }
    }

    // 4. Remove duplicates (optional cleanup)
    const finalApps = await db.loadApplications(userId);
    const duplicatesByZohoId = [];
    const seenZohoIds = new Map();
    
    for (const app of finalApps) {
      if (app.zohoId) {
        if (seenZohoIds.has(app.zohoId)) {
          duplicatesByZohoId.push(app);
        } else {
          seenZohoIds.set(app.zohoId, app);
        }
      }
    }
    
    // Remove duplicates
    for (const duplicate of duplicatesByZohoId) {
      await db.deleteApplication(duplicate.id);
    }

    return NextResponse.json({
      success: true,
      deals: syncedApplications,
      rawDealsData: deals,
      applicationsCount: syncedApplications.length,
      duplicatesRemoved: duplicatesByZohoId.length,
    });
  } catch (error) {
    console.error('Error fetching deals from Zoho CRM:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## Summary

### Key Takeaways

1. **Always cache access tokens** - Don't fetch on every request
2. **Handle errors gracefully** - Return null/empty instead of throwing
3. **Use query parameters** - For email searches, use `?email=...`
4. **Specify fields** - Always specify fields for related records
5. **Match by zohoId** - Store and match using Zoho record IDs
6. **Load once, process many** - Don't query database inside loops
7. **Preserve application data** - Only update Zoho-related fields when syncing
8. **Handle different response formats** - Zoho API can return data in various structures

### Quick Reference

```javascript
// Initialize
const zohoClient = new ZohoCRMClient();

// Get record
const contact = await zohoClient.getRecord('Contacts', '1234567890001');

// Search by email
const contacts = await zohoClient.searchByEmail('Contacts', 'user@example.com');

// Get related records
const deals = await zohoClient.getRelatedRecords('Contacts', contactId, 'Deals', 'id,Deal_Name,Stage');

// Create record
const newContact = await zohoClient.createRecord('Contacts', { First_Name: 'John', Last_Name: 'Doe' });

// Update record
await zohoClient.updateRecord('Contacts', contactId, { Phone: '+1234567890' });
```

---

## Additional Resources

- [Zoho CRM API v7 Documentation](https://www.zoho.com/crm/developer/docs/api/v7/)
- [Zoho CRM API Reference](https://www.zoho.com/crm/developer/docs/api/v7/overview.html)
- [Zoho CRM Field Names Reference](https://www.zoho.com/crm/developer/docs/api/v7/modules-api.html)

---

**Last Updated:** Based on production implementation from validifypro-visa-portal project


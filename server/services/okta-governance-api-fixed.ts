// Real IGA Catalog API Integration - Based on actual API response

export interface CatalogEntry {
  id: string;
  displayName: string;
  description?: string;
  type?: string;
  status: string;
  requestable?: boolean;
  availableRoles?: CatalogRole[];
}

export interface CatalogRole {
  id: string;
  name: string;
  description?: string;
}

export class OktaGovernanceService {
  private domain: string;
  private apiToken: string;

  constructor() {
    this.domain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.apiToken = process.env.OKTA_API_TOKEN || '';
  }

  async getCatalogEntries(accessToken?: string): Promise<CatalogEntry[]> {
    try {
      // Use the verified working IGA catalog API endpoint
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries?filter=status eq "ACTIVE"&limit=50`;
      
      console.log('🏪 Fetching real IGA catalog from:', url);
      console.log('🔑 Using API token:', this.apiToken ? 'Present' : 'Missing');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Okta-AI-Dashboard/1.0'
        }
      });

      console.log('📡 IGA Catalog API Response status:', response.status);
      
      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ Raw IGA catalog response received');
        
        // Extract entries from the standard IGA API response format: {data: [...]}
        const entries = responseData.data || [];
        console.log('📊 Extracted IGA catalog entries:', entries.length, 'items');
        
        if (Array.isArray(entries) && entries.length > 0) {
          const processedEntries = entries.map((item: any) => ({
            id: item.id,
            displayName: item.name || item.displayName || item.label,
            description: `${item.label || 'Application'} - ${item.requestable ? 'Available for request' : 'Not requestable'}`,
            type: item.label || 'application',
            status: item.requestable ? 'AVAILABLE' : 'RESTRICTED',
            requestable: item.requestable !== false
          }));
          
          console.log('📊 Successfully processed:', processedEntries.length, 'real IGA catalog entries');
          console.log('📋 Sample processed entry:', JSON.stringify(processedEntries[0], null, 2));
          return processedEntries;
        } else {
          console.log('⚠️ IGA catalog returned empty data array');
          return [];
        }
      } else {
        const errorText = await response.text();
        console.error('❌ IGA Catalog API failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`IGA Catalog API failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Fatal error accessing real IGA catalog:', error);
      throw error;
    }
  }

  // Other governance service methods remain unchanged...
  async getCatalogEntryDetails(entryId: string, accessToken?: string): Promise<CatalogEntry> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entryId}`;
      
      console.log('🔍 Fetching catalog entry details:', entryId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch catalog entry: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        id: data.id,
        displayName: data.name || data.displayName,
        description: data.description,
        type: data.label,
        status: data.requestable ? 'AVAILABLE' : 'RESTRICTED',
        requestable: data.requestable
      };
    } catch (error) {
      console.error('❌ Error fetching catalog entry details:', error);
      throw error;
    }
  }
}
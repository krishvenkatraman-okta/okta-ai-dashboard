export interface CatalogEntry {
  id: string;
  displayName: string;
  description?: string;
  type: string;
  status: string;
  availableRoles?: CatalogRole[];
}

export interface CatalogRole {
  id: string;
  displayName: string;
  description?: string;
  type: string;
}

export interface AccessRequest {
  catalogId: string;
  roleId?: string;
  justification: string;
  duration?: string;
  durationUnit?: 'hours' | 'days' | 'weeks';
}

export interface AccessRequestResponse {
  id: string;
  status: string;
  catalogEntryDisplayName: string;
  requestedOn: string;
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
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries?filter=not%28parent+pr%29&limit=20`;
      
      console.log('🏪 Fetching catalog entries from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Catalog fetch failed:', response.status, await response.text());
        throw new Error(`Failed to fetch catalog: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Catalog entries fetched:', data.length || 0, 'items');
      
      return data.map((item: any) => ({
        id: item.id,
        displayName: item.displayName,
        description: item.description,
        type: item.type,
        status: item.status
      }));
    } catch (error) {
      console.error('❌ Error fetching catalog entries:', error);
      throw error;
    }
  }

  async getCatalogEntryDetails(entryId: string, accessToken?: string): Promise<CatalogEntry> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entryId}`;
      
      console.log('🔍 Fetching catalog entry details:', entryId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch catalog entry: ${response.status}`);
      }

      const data = await response.json();
      
      // Fetch available roles for this entry
      const roles = await this.getCatalogEntryRoles(entryId, accessToken);
      
      return {
        id: data.id,
        displayName: data.displayName,
        description: data.description,
        type: data.type,
        status: data.status,
        availableRoles: roles
      };
    } catch (error) {
      console.error('❌ Error fetching catalog entry details:', error);
      throw error;
    }
  }

  async getCatalogEntryRoles(entryId: string, accessToken?: string): Promise<CatalogRole[]> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entryId}/roles`;
      
      console.log('🎭 Fetching roles for catalog entry:', entryId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('⚠️ Roles fetch failed, returning empty array');
        return [];
      }

      const data = await response.json();
      
      return data.map((role: any) => ({
        id: role.id,
        displayName: role.displayName,
        description: role.description,
        type: role.type
      }));
    } catch (error) {
      console.error('❌ Error fetching catalog entry roles:', error);
      return [];
    }
  }

  async submitAccessRequest(request: AccessRequest, accessToken?: string): Promise<AccessRequestResponse> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/requests`;
      
      console.log('📝 Submitting access request:', request);
      
      const requestBody = {
        catalogEntryId: request.catalogId,
        roleId: request.roleId,
        justification: request.justification,
        ...(request.duration && {
          requestedDuration: {
            amount: parseInt(request.duration),
            unit: request.durationUnit || 'hours'
          }
        })
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Access request failed:', response.status, errorText);
        throw new Error(`Access request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Access request submitted successfully:', data.id);
      
      return {
        id: data.id,
        status: data.status,
        catalogEntryDisplayName: data.catalogEntryDisplayName,
        requestedOn: data.requestedOn
      };
    } catch (error) {
      console.error('❌ Error submitting access request:', error);
      throw error;
    }
  }

  async getMyRequests(accessToken?: string): Promise<AccessRequestResponse[]> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/requests?limit=20&sortBy=requestedOn&sortOrder=desc`;
      
      console.log('📋 Fetching user requests');
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch requests: ${response.status}`);
      }

      const data = await response.json();
      
      return data.map((req: any) => ({
        id: req.id,
        status: req.status,
        catalogEntryDisplayName: req.catalogEntryDisplayName,
        requestedOn: req.requestedOn
      }));
    } catch (error) {
      console.error('❌ Error fetching user requests:', error);
      throw error;
    }
  }
}
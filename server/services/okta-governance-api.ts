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

export interface AccessRequest {
  catalogId: string;
  justification: string;
  roleId?: string;
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
            description: `${item.label || 'Application'} - Available for access request`,
            type: item.label || 'application',
            status: 'AVAILABLE', // Always show as available since we'll check parent API for actual roles
            requestable: true // Allow all apps to be requested, we'll check roles via parent API
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

  async getCatalogEntryRoles(entryId: string, accessToken?: string): Promise<CatalogRole[]> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entryId}/roles`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('No roles found for catalog entry:', entryId);
        return [];
      }

      const data = await response.json();
      return data.map((role: any) => ({
        id: role.id,
        name: role.name,
        description: role.description
      }));
    } catch (error) {
      console.error('Error fetching catalog entry roles:', error);
      return [];
    }
  }

  async getCatalogEntryRolesViaParent(entryId: string, accessToken?: string): Promise<CatalogRole[]> {
    try {
      // Use the parent API to get actual requestable roles for this application
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries?filter=parent eq "${entryId}"&limit=20`;
      
      console.log('🎭 Fetching roles via parent API for:', entryId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('⚠️ Parent API failed, returning empty roles');
        return [];
      }

      const data = await response.json();
      console.log('✅ Parent API response:', JSON.stringify(data, null, 2));
      
      // Extract roles from parent API response
      const roles = (data.data || []).map((role: any) => ({
        id: role.id,
        name: role.name || role.displayName,
        description: role.description || `Access role for ${role.name}`
      }));
      
      console.log('🎭 Found', roles.length, 'roles via parent API');
      return roles;
    } catch (error) {
      console.error('❌ Error fetching roles via parent API:', error);
      return [];
    }
  }

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

  async getEntitlementRequestFields(entitlementId: string, accessToken?: string): Promise<any[]> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/request-fields`;
      
      console.log('📋 Fetching request fields for entitlement:', entitlementId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('⚠️ Request fields API failed, using default justification field');
        return [
          {
            key: 'justification',
            label: 'Business Justification',
            type: 'text',
            required: true,
            placeholder: 'Please provide your business justification for this access request'
          }
        ];
      }

      const data = await response.json();
      console.log('✅ Request fields response:', JSON.stringify(data, null, 2));
      
      // Process fields from API response
      const fields = (data.data || data || []).map((field: any) => ({
        key: field.key || field.name,
        label: field.label || field.displayName,
        type: field.type || 'text',
        required: field.required || false,
        placeholder: field.placeholder || field.description,
        options: field.options || field.values
      }));
      
      console.log('📋 Found', fields.length, 'request fields');
      return fields;
    } catch (error) {
      console.error('❌ Error fetching request fields:', error);
      // Return default justification field if API fails
      return [
        {
          key: 'justification',
          label: 'Business Justification',
          type: 'text',
          required: true,
          placeholder: 'Please provide your business justification for this access request'
        }
      ];
    }
  }

  async submitEntitlementRequest(entitlementId: string, justification: string, accessToken?: string, duration?: string): Promise<any> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`;
      
      console.log('📝 Submitting entitlement request for:', entitlementId);
      
      const requestBody: any = {
        justification: justification,
        requestType: 'GRANT_ACCESS'
      };
      
      // Add duration if provided
      if (duration) {
        const durationMatch = duration.match(/(\d+)\s*(hour|day|week|month)s?/i);
        if (durationMatch) {
          const value = parseInt(durationMatch[1]);
          const unit = durationMatch[2].toLowerCase();
          
          // Convert to standard Okta duration format
          if (unit === 'hour') {
            requestBody.duration = value;
            requestBody.durationUnit = 'HOURS';
          } else if (unit === 'day') {
            requestBody.duration = value;
            requestBody.durationUnit = 'DAYS';
          } else if (unit === 'week') {
            requestBody.duration = value * 7;
            requestBody.durationUnit = 'DAYS';
          } else if (unit === 'month') {
            requestBody.duration = value * 30;
            requestBody.durationUnit = 'DAYS';
          }
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Entitlement request failed:', response.status, errorText);
        throw new Error(`Entitlement request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Entitlement request submitted successfully:', data.id);
      
      return {
        id: data.id,
        status: data.status,
        entitlementName: data.catalogEntryDisplayName || 'Requested Entitlement',
        requestedOn: data.requestedOn || new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error submitting entitlement request:', error);
      throw error;
    }
  }

  async submitAccessRequest(request: any, accessToken?: string): Promise<any> {
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
          'Authorization': `SSWS ${this.apiToken}`,
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

  async getMyRequests(accessToken?: string): Promise<any[]> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/requests?limit=20&sortBy=requestedOn&sortOrder=desc`;
      
      console.log('📋 Fetching user requests');
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
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
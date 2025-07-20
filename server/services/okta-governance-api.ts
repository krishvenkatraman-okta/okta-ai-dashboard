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
        console.log('⚠️ Request fields API failed, using default fields');
        return [
          {
            key: 'JUSTIFICATION',
            label: 'Business Justification',
            type: 'text',
            required: true,
            placeholder: 'Please provide your business justification for this access request'
          },
          {
            key: 'ACCESS_DURATION',
            label: 'Access Duration',
            type: 'duration',
            required: false,
            placeholder: 'Duration for access (e.g., 1 hour, 2 days)'
          }
        ];
      }

      const data = await response.json();
      console.log('✅ Request fields response:', JSON.stringify(data, null, 2));
      
      // Process fields from API response
      const fields = (data.data || data || []).map((field: any) => ({
        key: field.id || field.key || field.name,  // Use 'id' as primary key for field identification
        label: field.label || field.displayName || field.name,
        type: field.type || 'text',
        required: field.required || false,
        placeholder: field.placeholder || field.description,
        options: field.options || field.values
      }));
      
      console.log('📋 Found', fields.length, 'request fields');
      return fields;
    } catch (error) {
      console.error('❌ Error fetching request fields:', error);
      // Return default fields if API fails
      return [
        {
          key: 'JUSTIFICATION',
          label: 'Business Justification',
          type: 'text',
          required: true,
          placeholder: 'Please provide your business justification for this access request'
        },
        {
          key: 'ACCESS_DURATION',
          label: 'Access Duration',
          type: 'duration',
          required: false,
          placeholder: 'Duration for access (e.g., 1 hour, 2 days)'
        }
      ];
    }
  }

  async submitEntitlementRequest(entitlementId: string, justification: string, accessToken?: string, duration?: string): Promise<any> {
    try {
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`;
      
      console.log('📝 Submitting entitlement request for:', entitlementId);
      console.log('📝 Request details:', { justification, duration });
      
      // Get the request fields for this entitlement to build proper payload
      const requestFields = await this.getEntitlementRequestFields(entitlementId, accessToken);
      console.log('📋 Available request fields:', requestFields);
      
      // Build the requesterFieldValues array based on available fields
      const requesterFieldValues: any[] = [];
      
      // Add justification - try multiple field identification methods
      let justificationField = requestFields.find(field => 
        field.key?.toUpperCase() === 'JUSTIFICATION' ||
        field.key?.toLowerCase().includes('justification') || 
        field.type?.toLowerCase() === 'text' ||
        field.label?.toLowerCase().includes('justification')
      );
      
      // If no specific justification field found, use the first text field
      if (!justificationField) {
        justificationField = requestFields.find(field => field.type?.toLowerCase() === 'text');
      }
      
      if (justificationField) {
        requesterFieldValues.push({
          id: justificationField.key,
          value: justification
        });
        console.log(`📝 Added justification with field ID: "${justificationField.key}"`);
      } else {
        // Fallback - add with standard field name
        requesterFieldValues.push({
          id: 'JUSTIFICATION',
          value: justification
        });
        console.log('📝 Using fallback justification field ID: JUSTIFICATION');
      }
      
      // Add duration if provided and there's a duration field
      if (duration) {
        let durationField = requestFields.find(field => 
          field.key?.toUpperCase() === 'ACCESS_DURATION' ||
          field.key?.toLowerCase().includes('duration') || 
          field.type?.toLowerCase() === 'duration'
        );
        
        if (durationField) {
          // Convert duration to ISO 8601 format (PT1H format)
          const durationMatch = duration.match(/(\d+)\s*(hour|day|week|month)s?/i);
          let isoValue = 'PT1H'; // default to 1 hour
          
          if (durationMatch) {
            const value = parseInt(durationMatch[1]);
            const unit = durationMatch[2].toLowerCase();
            
            if (unit === 'hour') {
              isoValue = `PT${value}H`;
            } else if (unit === 'day') {
              isoValue = `P${value}D`;
            } else if (unit === 'week') {
              isoValue = `P${value}W`;
            } else if (unit === 'month') {
              isoValue = `P${value}M`;
            }
          }
          
          requesterFieldValues.push({
            id: durationField.key,
            value: isoValue
          });
          
          console.log(`📅 Added duration with field ID: "${durationField.key}" -> "${isoValue}"`);
        } else {
          // Fallback - add with standard field name
          const durationMatch = duration.match(/(\d+)\s*(hour|day|week|month)s?/i);
          let isoValue = 'PT1H';
          
          if (durationMatch) {
            const value = parseInt(durationMatch[1]);
            const unit = durationMatch[2].toLowerCase();
            
            if (unit === 'hour') {
              isoValue = `PT${value}H`;
            } else if (unit === 'day') {
              isoValue = `P${value}D`;
            } else if (unit === 'week') {
              isoValue = `P${value}W`;
            } else if (unit === 'month') {
              isoValue = `P${value}M`;
            }
          }
          
          requesterFieldValues.push({
            id: 'ACCESS_DURATION',
            value: isoValue
          });
          
          console.log(`📅 Using fallback duration field ID: ACCESS_DURATION -> "${isoValue}"`);
        }
      }
      
      // Build the correct request body format
      const requestBody = {
        requesterFieldValues: requesterFieldValues
      };
      
      console.log('📝 Final request payload:', JSON.stringify(requestBody, null, 2));

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
        console.error('❌ Request body was:', JSON.stringify(requestBody, null, 2));
        throw new Error(`Entitlement request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Entitlement request submitted successfully:', JSON.stringify(data, null, 2));
      
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

  async getGovernanceCampaigns(accessToken?: string): Promise<any[]> {
    try {
      const url = `https://${this.domain}/api/v1/governance/campaigns`;
      
      console.log('🏛️ Fetching governance campaigns...');
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('⚠️ Governance campaigns API failed, returning empty list');
        return [];
      }

      const data = await response.json();
      console.log('✅ Governance campaigns response:', JSON.stringify(data, null, 2));
      
      // Handle different response formats
      const campaigns = data.items || data.campaigns || data || [];
      console.log('📊 Found', campaigns.length, 'governance campaigns');
      
      return campaigns;
    } catch (error) {
      console.error('❌ Error fetching governance campaigns:', error);
      return [];
    }
  }

  async createGovernanceCampaign(name: string, description: string, accessToken?: string): Promise<any> {
    try {
      const url = `https://${this.domain}/api/v1/governance/campaigns`;
      
      console.log('🏗️ Creating governance campaign:', name);
      
      const requestBody = {
        name: name,
        description: description,
        campaignType: 'ACCESS_CERTIFICATION',
        schedule: {
          type: 'IMMEDIATE'
        }
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
        throw new Error(`Failed to create governance campaign: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Governance campaign created:', data.id);
      
      return data;
    } catch (error) {
      console.error('❌ Error creating governance campaign:', error);
      throw error;
    }
  }

  async getUserApplicationAccess(userId: string, accessToken?: string): Promise<any[]> {
    try {
      const managementToken = this.apiToken;
      if (!managementToken) {
        throw new Error('Management API token required');
      }

      console.log('📊 Starting 30-day access review for user:', userId);

      // First, get user's application assignments
      const appLinksUrl = `https://${this.domain}/api/v1/users/${userId}/appLinks`;
      
      const appLinksResponse = await fetch(appLinksUrl, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!appLinksResponse.ok) {
        console.error('❌ Failed to fetch user app links:', appLinksResponse.status);
        return [];
      }

      const appLinks = await appLinksResponse.json();
      console.log(`📱 Found ${appLinks.length} application assignments for user`);

      if (appLinks.length === 0) {
        console.log('📱 No applications assigned to user');
        return [];
      }

      // Prepare date ranges for System Log API
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const today = new Date();

      // Format dates for System Log API (ISO format)
      const sinceDate = thirtyDaysAgo.toISOString();
      const untilDate = today.toISOString();

      console.log(`📅 Checking usage from ${sinceDate} to ${untilDate}`);

      // Check each application for SSO usage in the last 30 days using System Log API
      const accessReview: any[] = [];
      
      for (const app of appLinks) {
        const appId = app.appInstanceId;
        const appName = app.label || app.appName || 'Unknown App';
        
        console.log(`🔍 Checking System Log for app: ${appName} (${appId})`);
        
        // Use System Log API with proper filter format
        const filter = `actor.id eq "${userId}" and target.id eq "${appId}" and eventType eq "user.authentication.sso"`;
        const syslogUrl = `https://${this.domain}/api/v1/logs?filter=${encodeURIComponent(filter)}&since=${encodeURIComponent(sinceDate)}&until=${encodeURIComponent(untilDate)}&limit=1`;
        
        try {
          const syslogResponse = await fetch(syslogUrl, {
            headers: {
              'Authorization': `SSWS ${managementToken}`,
              'Accept': 'application/json'
            }
          });

          if (!syslogResponse.ok) {
            console.warn(`⚠️ System Log API failed for app ${appId}: ${syslogResponse.status}`);
            // Add app to review list with unknown access status
            accessReview.push({
              applicationId: appId,
              applicationName: appName,
              lastAccessedDate: 'Unable to determine',
              daysSinceAccess: 60, // Conservative estimate
              shouldReview: true
            });
            continue;
          }

          const syslogData = await syslogResponse.json();
          const hasRecentAccess = syslogData.length > 0;
          
          if (!hasRecentAccess) {
            // No SSO events in the last 30 days - this app should be reviewed
            let lastAccessedDate = 'Never accessed';
            let daysSinceAccess = 365; // More realistic than 999
            
            // Try to find the last access before 30 days ago
            const lastAccessFilter = `actor.id eq "${userId}" and target.id eq "${appId}" and eventType eq "user.authentication.sso"`;
            const lastAccessUrl = `https://${this.domain}/api/v1/logs?filter=${encodeURIComponent(lastAccessFilter)}&limit=1&sortOrder=DESCENDING`;
            
            try {
              const lastAccessResponse = await fetch(lastAccessUrl, {
                headers: {
                  'Authorization': `SSWS ${managementToken}`,
                  'Accept': 'application/json'
                }
              });

              if (lastAccessResponse.ok) {
                const lastAccessData = await lastAccessResponse.json();
                if (lastAccessData.length > 0) {
                  const lastEventDate = new Date(lastAccessData[0].published);
                  daysSinceAccess = Math.floor((Date.now() - lastEventDate.getTime()) / (1000 * 60 * 60 * 24));
                  lastAccessedDate = lastEventDate.toISOString().split('T')[0];
                  console.log(`📅 Found last access for ${appName}: ${lastAccessedDate} (${daysSinceAccess} days ago)`);
                } else {
                  console.log(`📅 No SSO events found for ${appName} - never accessed`);
                }
              } else {
                console.warn(`⚠️ System Log API failed for last access check: ${lastAccessResponse.status}`);
                lastAccessedDate = 'Unable to determine';
                daysSinceAccess = 60; // Conservative estimate
              }
            } catch (lastAccessError) {
              console.warn(`⚠️ Could not fetch last access for app ${appId}:`, lastAccessError);
              lastAccessedDate = 'Unable to determine';
              daysSinceAccess = 60;
            }
            
            accessReview.push({
              applicationId: appId,
              applicationName: appName,
              lastAccessedDate: lastAccessedDate,
              daysSinceAccess: daysSinceAccess,
              shouldReview: true
            });
          } else {
            console.log(`✅ App ${appName} has recent access - no review needed`);
          }
        } catch (appError) {
          console.error(`❌ Error checking access for app ${appId}:`, appError);
        }
      }

      console.log(`📋 30-day review complete: ${accessReview.length} apps need review`);
      return accessReview;
      
    } catch (error) {
      console.error('❌ Error in 30-day access review:', error);
      return [];
    }
  }
}
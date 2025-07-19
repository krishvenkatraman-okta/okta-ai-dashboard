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

export interface OwnedApplication {
  id: string;
  name: string;
  status: string;
  assignedUsers: number;
  lastAccessed?: string;
}

export interface GovernanceCampaign {
  id: string;
  name: string;
  description: string;
  applicationIds: string[];
  reviewers: string[];
  duration: number;
  durationUnit: 'days' | 'weeks';
}

export interface UserApplicationAccess {
  applicationId: string;
  applicationName: string;
  lastAccessed: string;
  daysSinceAccess: number;
  shouldReview: boolean;
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
      // Use proper IGA catalog API endpoint
      const url = `https://${this.domain}/governance/api/v2/my/catalogs/default/entries?filter=status eq "ACTIVE"&limit=50`;
      
      console.log('🏪 Fetching real IGA catalog from:', url);
      console.log('🔑 Using API token:', this.apiToken ? 'Present' : 'Missing');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Okta-AI-Dashboard/1.0'
        }
      });

      console.log('📡 API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Real catalog fetched:', data?.length || 0, 'entries');
        console.log('📋 Sample catalog entry:', JSON.stringify(data?.[0], null, 2));
        
        if (data && Array.isArray(data) && data.length > 0) {
          const processedEntries = data.map((item: any) => ({
            id: item.id,
            displayName: item.displayName || item.name || item.label,
            description: item.description,
            type: item.type || 'application',
            status: item.status || 'AVAILABLE',
            requestable: item.requestable !== false // Default to true unless explicitly false
          }));
          
          console.log('📊 Processed entries:', processedEntries.length, 'total');
          return processedEntries;
        }
      }

      // Log the error details for debugging - Clone the response before reading
      const errorText = await response.clone().text();
      console.error('❌ IGA Catalog API failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: url
      });
      
      // Try alternative endpoint with different path
      console.log('🔄 Trying alternative IGA endpoint...');
      const altUrl = `https://${this.domain}/governance/api/v2/my/catalogs?filter=status eq "ACTIVE"&limit=50`;
      const altResponse = await fetch(altUrl, {
        headers: {
          'Authorization': `SSWS ${this.apiToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        console.log('✅ Alternative catalog endpoint worked:', altData?.length || 0, 'entries');
        
        // Handle different response structures
        const items = Array.isArray(altData) ? altData : (altData.catalogs || altData.entries || altData.items || []);
        
        return items.map((item: any) => ({
          id: item.id || item.catalogId,
          displayName: item.displayName || item.name || item.label,
          description: item.description,
          type: item.type || 'application',
          status: item.status || 'AVAILABLE'
        }));
      }

      // If both endpoints fail, throw error to indicate real API failure
      throw new Error(`IGA Catalog API failed: ${response.status} - ${errorText}`);
    } catch (error) {
      console.error('❌ Fatal error accessing IGA catalog:', error);
      
      // Return error indicator instead of mock data
      return [{
        id: 'api-error',
        displayName: 'IGA Catalog API Error',
        description: `Failed to fetch real catalog: ${error.message}. Please check your OKTA_API_TOKEN and ensure IGA is enabled.`,
        type: 'error',
        status: 'UNAVAILABLE'
      }];
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

  async getOwnedApplications(userId: string, accessToken?: string): Promise<OwnedApplication[]> {
    try {
      const managementToken = this.apiToken;
      if (!managementToken) {
        throw new Error('Management API token required for app owner operations');
      }

      // Get applications owned by the user
      const url = `https://${this.domain}/api/v1/apps?filter=user.id+eq+"${userId}"&expand=user`;
      
      console.log('🏢 Fetching owned applications for user:', userId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch owned apps:', response.status);
        return [];
      }

      const apps = await response.json();
      
      return apps.map((app: any) => ({
        id: app.id,
        name: app.label || app.name,
        status: app.status,
        assignedUsers: app._embedded?.users?.length || 0,
        lastAccessed: app.lastUpdated
      }));
    } catch (error) {
      console.error('❌ Error fetching owned applications:', error);
      return [];
    }
  }

  async createGovernanceCampaign(campaign: GovernanceCampaign, accessToken?: string): Promise<{ id: string; status: string }> {
    try {
      const url = `https://${this.domain}/governance/api/v2/campaigns`;
      
      console.log('🏛️ Creating governance campaign:', campaign.name);
      
      const requestBody = {
        name: campaign.name,
        description: campaign.description,
        type: 'ACCESS_REVIEW',
        applicationIds: campaign.applicationIds,
        reviewers: campaign.reviewers,
        schedule: {
          duration: campaign.duration,
          durationUnit: campaign.durationUnit,
          startDate: new Date().toISOString()
        },
        settings: {
          autoApprove: false,
          requireJustification: true,
          notifyReviewers: true
        }
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
        console.error('❌ Campaign creation failed:', response.status, errorText);
        throw new Error(`Campaign creation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Governance campaign created:', result.id);
      
      return {
        id: result.id,
        status: result.status
      };
    } catch (error) {
      console.error('❌ Error creating governance campaign:', error);
      throw error;
    }
  }

  async getUserApplicationAccess(userId: string, accessToken?: string): Promise<UserApplicationAccess[]> {
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
      const accessReview: UserApplicationAccess[] = [];
      
      for (const app of appLinks) {
        const appId = app.appInstanceId;
        const appName = app.label || app.appName || 'Unknown App';
        
        console.log(`🔍 Checking System Log for app: ${appName} (${appId})`);
        
        // Use System Log API with the exact filter format you specified
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
            continue;
          }

          const syslogData = await syslogResponse.json();
          const hasRecentAccess = syslogData.length > 0;
          
          if (!hasRecentAccess) {
            // No SSO events in the last 30 days - this app should be reviewed
            let lastAccessedDate = 'Unknown';
            let daysSinceAccess = 999;
            
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
                  lastAccessedDate = 'Never accessed';
                  daysSinceAccess = 365; // More realistic than 999
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
              lastAccessed: lastAccessedDate,
              daysSinceAccess,
              shouldReview: true
            });
            
            console.log(`❌ App ${appName} not accessed in 30+ days (${daysSinceAccess} days)`);
          } else {
            console.log(`✅ App ${appName} accessed within 30 days`);
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

  async revokeUserAccess(userId: string, applicationId: string, accessToken?: string): Promise<{ success: boolean }> {
    try {
      const managementToken = this.apiToken;
      if (!managementToken) {
        throw new Error('Management API token required');
      }

      const url = `https://${this.domain}/api/v1/apps/${applicationId}/users/${userId}`;
      
      console.log('🚫 Revoking user access:', { userId, applicationId });
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Access revocation failed:', response.status);
        throw new Error(`Access revocation failed: ${response.status}`);
      }

      console.log('✅ User access revoked successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error revoking user access:', error);
      throw error;
    }
  }
}
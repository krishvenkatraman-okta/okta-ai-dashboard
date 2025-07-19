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

      // Get user's application assignments
      const url = `https://${this.domain}/api/v1/users/${userId}/appLinks`;
      
      console.log('📊 Fetching user application access for 30-day review:', userId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Failed to fetch user app access:', response.status);
        return [];
      }

      const appLinks = await response.json();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      return appLinks.map((app: any) => {
        const lastAccessed = new Date(app.lastUpdated || app.created);
        const daysSinceAccess = Math.floor((Date.now() - lastAccessed.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          applicationId: app.appInstanceId,
          applicationName: app.label || app.appName,
          lastAccessed: lastAccessed.toISOString().split('T')[0],
          daysSinceAccess,
          shouldReview: daysSinceAccess > 30
        };
      }).filter((access: UserApplicationAccess) => access.shouldReview);
    } catch (error) {
      console.error('❌ Error fetching user application access:', error);
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
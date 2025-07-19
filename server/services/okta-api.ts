export class OktaApiService {
  private readonly oktaDomain: string;

  constructor() {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
  }

  async getDashboardStats(accessToken: string): Promise<any> {
    try {
      // In a real implementation, these would be actual API calls to Okta Management API
      // For now, return simulated data to match the design
      
      const stats = {
        users: await this.getUserCount(accessToken),
        apps: await this.getApplicationCount(accessToken),
        pendingRequests: await this.getPendingRequestsCount(accessToken)
      };

      return stats;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      // Return fallback data
      return {
        users: '2,847',
        apps: '24',
        pendingRequests: '12'
      };
    }
  }

  private async getUserCount(accessToken: string): Promise<string> {
    try {
      const response = await fetch(`https://${this.oktaDomain}/api/v1/users?limit=1`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        // In a real implementation, you would parse the response and count users
        // For now, return a realistic number
        return '2,847';
      }
    } catch (error) {
      console.error('Error fetching user count:', error);
    }
    
    return '---';
  }

  private async getApplicationCount(accessToken: string): Promise<string> {
    try {
      const response = await fetch(`https://${this.oktaDomain}/api/v1/apps?limit=1`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        // In a real implementation, you would parse the response and count apps
        return '24';
      }
    } catch (error) {
      console.error('Error fetching app count:', error);
    }
    
    return '---';
  }

  private async getPendingRequestsCount(accessToken: string): Promise<string> {
    // This would typically come from Okta Governance or Workflows
    // For now, return simulated data
    return '12';
  }

  async getUserAppLinks(accessToken: string): Promise<any[]> {
    try {
      // Get user's app links from Okta - this is what the end user dashboard shows
      const response = await fetch(`https://${this.oktaDomain}/api/v1/users/me/appLinks`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const appLinks = await response.json();
        return appLinks;
      }

      // Fallback to Management API if user token doesn't work
      const managementToken = process.env.OKTA_API_TOKEN;
      if (managementToken) {
        const meResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });

        if (meResponse.ok) {
          const user = await meResponse.json();
          const appLinksResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/${user.id}/appLinks`, {
            headers: {
              'Authorization': `SSWS ${managementToken}`,
              'Accept': 'application/json'
            }
          });

          if (appLinksResponse.ok) {
            return await appLinksResponse.json();
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user app links:', error);
    }
    
    return [];
  }

  async getApplications(accessToken: string): Promise<any[]> {
    try {
      // First try with user's access token for their assigned apps
      const userAppsResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/me/appLinks`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (userAppsResponse.ok) {
        const userApps = await userAppsResponse.json();
        return userApps;
      }

      // Fallback to Management API if user token doesn't work
      const managementToken = process.env.OKTA_API_TOKEN;
      if (managementToken) {
        const response = await fetch(`https://${this.oktaDomain}/api/v1/apps`, {
          headers: {
            'Authorization': `SSWS ${managementToken}`,
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          return await response.json();
        }
      }

    } catch (error) {
      console.error('Error fetching applications:', error);
    }
    
    return [];
  }

  async getUsers(accessToken: string): Promise<any[]> {
    try {
      const response = await fetch(`https://${this.oktaDomain}/api/v1/users`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    
    return [];
  }

  async getGroups(accessToken: string): Promise<any[]> {
    try {
      const response = await fetch(`https://${this.oktaDomain}/api/v1/groups`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
    
    return [];
  }

  async getGovernanceEnabledApps(accessToken: string): Promise<any[]> {
    try {
      // Get applications that have governance enabled
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        return [];
      }

      const response = await fetch(`https://${this.oktaDomain}/api/v1/apps?filter=features.governance eq "ENABLED"`, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching governance apps:', error);
    }
    
    return [];
  }

  async getCatalogEntries(accessToken: string): Promise<any[]> {
    try {
      // Get catalog entries for access requests using Catalog v2 API
      const response = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=50`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.entries || data;
      }

      // Fallback to management token
      const managementToken = process.env.OKTA_API_TOKEN;
      if (managementToken) {
        const fallbackResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/catalogs/default/entries?filter=not(parent pr)&limit=50`, {
          headers: {
            'Authorization': `SSWS ${managementToken}`,
            'Accept': 'application/json'
          }
        });

        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          return data.entries || data;
        }
      }
    } catch (error) {
      console.error('Error fetching catalog entries:', error);
    }
    
    return [];
  }

  async submitAccessRequest(accessToken: string, entryId: string, justification?: string): Promise<any> {
    try {
      // Submit access request using My Requests v2 API
      const requestBody = {
        entryId,
        justification: justification || 'Access requested through Okta Assistant'
      };

      const response = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error submitting access request:', error);
    }
    
    throw new Error('Failed to submit access request');
  }

  async createGovernanceCampaign(accessToken: string, campaignData: any): Promise<any> {
    try {
      // Create governance campaign using IGA API
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        throw new Error('Management token required for campaign creation');
      }

      const response = await fetch(`https://${this.oktaDomain}/governance/api/v1/campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error creating governance campaign:', error);
    }
    
    throw new Error('Failed to create governance campaign');
  }

  async getUserAccessHistory(accessToken: string, days: number = 30): Promise<any[]> {
    try {
      // Get user's access history for governance review
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        return [];
      }

      // Get user info first
      const userResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (userResponse.ok) {
        const user = await userResponse.json();
        
        // Get system logs for user access
        const logsResponse = await fetch(
          `https://${this.oktaDomain}/api/v1/logs?filter=actor.id eq "${user.id}" and eventType eq "user.session.access_app" and published gt "${startDate.toISOString()}"&limit=1000`, 
          {
            headers: {
              'Authorization': `SSWS ${managementToken}`,
              'Accept': 'application/json'
            }
          }
        );

        if (logsResponse.ok) {
          return await logsResponse.json();
        }
      }
    } catch (error) {
      console.error('Error fetching user access history:', error);
    }
    
    return [];
  }

  async revokeUserAppAccess(accessToken: string, userId: string, appId: string): Promise<any> {
    try {
      // Revoke user access to application
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        throw new Error('Management token required for access revocation');
      }

      const response = await fetch(`https://${this.oktaDomain}/api/v1/apps/${appId}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok || response.status === 204) {
        return { success: true, message: 'Access revoked successfully' };
      }
    } catch (error) {
      console.error('Error revoking app access:', error);
    }
    
    throw new Error('Failed to revoke app access');
  }
}

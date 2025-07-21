import type { User } from '@shared/schema';
import { LocalOllamaService } from './local-ollama';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface GovernanceAction {
  type: 'campaign' | 'access_request' | 'access_review' | 'revoke_access' | 'list_apps' | 'list_catalog';
  appName?: string;
  frequency?: string;
  reviewer?: string;
  entryId?: string;
  justification?: string;
  days?: number;
  appId?: string;
}

export class LLMAutomationService {
  private readonly oktaDomain: string;
  private readonly oktaApiToken: string;
  private readonly ollama: LocalOllamaService;
  private oktaAuthService: any; // Will be injected

  constructor(oktaAuthService?: any) {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.oktaApiToken = process.env.OKTA_API_TOKEN || '';
    this.ollama = new LocalOllamaService();
    this.oktaAuthService = oktaAuthService;
    
    // Initialize Ollama in background
    this.ollama.initialize().catch(console.warn);
  }

  async processGovernanceRequest(message: string, user: User, tokens: OktaTokens): Promise<any> {
    console.log('🔍 LLM processing request:', message);
    
    // Use Ollama for intelligent intent analysis
    const analysis = await this.ollama.analyzeIntent(message);
    console.log('🧠 Intent analysis result:', analysis);
    
    // Handle based on the analyzed intent first, then fall back to pattern matching
    if (analysis.intent === 'catalog_request') {
      console.log('📋 LLM detected catalog request');
      return await this.handleCatalogRequest(user, tokens);
    }
    
    if (analysis.intent === 'group_management') {
      console.log('👥 LLM detected group management request');
      const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
      
      if (!hasAdminSession) {
        console.log('🔐 No admin session - requiring admin auth');
        return this.requireAdminSession('group_management', user);
      }
      
      return await this.handleGroupManagement(analysis, user, tokens, hasAdminSession);
    }
    
    if (analysis.intent === 'access_level_inquiry') {
      console.log('🔑 LLM detected access level inquiry');
      return await this.handleAccessLevelInquiry(user, tokens);
    }
    
    // Fallback to pattern matching for missed cases
    const lowerMessage = message.toLowerCase();
    
    // Check for group management operations
    if (lowerMessage.includes('group management') || 
        lowerMessage.includes('show my groups') ||
        lowerMessage.includes('manage groups') ||
        lowerMessage.includes('group operations')) {
      console.log('👥 Pattern matched group management - checking admin session');
      const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
      
      if (!hasAdminSession) {
        console.log('🔐 No admin session - requiring admin auth');
        return this.requireAdminSession('group_management', user);
      }
      
      return await this.handleGroupManagement({ intent: 'group_management' }, user, tokens, hasAdminSession);
    }
    
    // Check for catalog/application listing requests
    if (lowerMessage.includes('list available applications') || 
        lowerMessage.includes('applications to request') ||
        lowerMessage.includes('available apps') ||
        lowerMessage.includes('show catalog')) {
      console.log('📋 Pattern matched catalog request');
      return await this.handleCatalogRequest(user, tokens);
    }
    
    // Check for access level questions
    if (lowerMessage.includes('what can i do') || 
        lowerMessage.includes('current access level') ||
        lowerMessage.includes('my capabilities')) {
      console.log('🔑 Pattern matched access level inquiry');
      return await this.handleAccessLevelInquiry(user, tokens);
    }
    
    // Determine if this requires admin privileges for other operations
    const isAdminOperation = this.isAdminOperation(analysis.intent);
    const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
    
    // Handle admin operations
    if (isAdminOperation && !hasAdminSession) {
      console.log('🔐 Admin operation detected, no session - requiring auth');
      return this.requireAdminSession(analysis.intent, user);
    }
    
    // Handle based on intent
    switch (analysis.intent) {
      case 'access_review':
        // End-user operation - use regular tokens
        return await this.performAccessReview(analysis, user, tokens);
      case 'access_request':
        // End-user operation - use regular tokens
        return await this.handleAccessRequest(analysis, user, tokens);
      case 'governance_campaign':
        // Admin operation - requires admin session
        return {
          success: true,
          data: { response: `**🏛️ Governance Campaign**\n\nGovernance campaign creation requires admin privileges.\n\nPlease establish an admin session first.` }
        };
      case 'user_management':
        // Admin operation - requires admin session
        return {
          success: true,
          data: { response: `**👤 User Management**\n\nUser management requires admin privileges.\n\nPlease establish an admin session first.` }
        };
      case 'group_management':
        // Admin operation - requires admin session
        return await this.handleGroupManagement(analysis, user, tokens, hasAdminSession);
      default:
        // General response with appropriate capabilities
        const hasAdminSessionForDefault = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
        const capabilities = this.getUserCapabilities(user, !!hasAdminSessionForDefault);
        const context = `User: ${user.name}\nRole: ${user.role}\nCapabilities: ${capabilities.join(', ')}`;
        const response = await this.ollama.generateResponse(message, context);
        return {
          success: true,
          data: { response }
        };
    }
  }

  private isAdminOperation(intent: string): boolean {
    const adminOperations = [
      'governance_campaign',
      'user_management', 
      'group_management',
      'policy_management',
      'app_management'
    ];
    return adminOperations.includes(intent);
  }

  private requireAdminSession(intent: string, user: User): any {
    const adminDomain = this.oktaDomain.replace('.okta.com', '-admin.okta.com');
    
    return {
      success: false,
      requiresAdminAuth: true,
      data: {
        response: `**🔐 Admin Session Required**\n\nTo perform ${intent.replace('_', ' ')} operations, you need an active admin session.\n\n**Your Current Access:**\n• Role: ${this.formatRoleName(user.role)}\n• Can perform: 30-day access reviews, access requests\n\n**To unlock admin capabilities:**\n1. Click "Start Admin Session" below\n2. Authenticate in the admin portal\n3. Return here to continue\n\nThis ensures all admin actions are properly audited in Okta system logs.`,
        action: 'admin_auth_required',
        adminUrl: `https://${adminDomain}/admin/dashboard`,
        intent: intent
      }
    };
  }

  private formatRoleName(role: string): string {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private getUserCapabilities(user: User, hasAdminSession: boolean): string[] {
    const capabilities = ['30-day access review', 'access requests'];
    
    if (hasAdminSession) {
      switch (user.role) {
        case 'super_admin':
          capabilities.push('full admin operations', 'user management', 'governance campaigns', 'system configuration');
          break;
        case 'app_owner':
          capabilities.push('application management', 'governance campaigns', 'user access reviews');
          break;
        case 'group_admin':
          capabilities.push('group management', 'group memberships', 'group access reviews');
          break;
        default:
          if (user.allRoles?.some(role => role.toLowerCase().includes('group'))) {
            capabilities.push('group management', 'group memberships');
          }
      }
    }
    
    return capabilities;
  }

  private async handleGroupManagement(analysis: any, user: User, tokens: OktaTokens, adminSession: any): Promise<any> {
    if (!adminSession) {
      console.log('🔐 Group management requires admin session');
      return this.requireAdminSession('group_management', user);
    }

    console.log('👥 Processing group management with admin session');
    
    try {
      // Use Management API token for groups API
      const authHeader = this.oktaApiToken 
        ? `SSWS ${this.oktaApiToken}`
        : `Bearer ${tokens.accessToken}`;
        
      const response = await fetch(`https://${this.oktaDomain}/api/v1/groups`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Groups API error: ${response.status}`);
      }

      const groups = await response.json();
      console.log('✅ Groups fetched:', groups.length);

      if (groups && groups.length > 0) {
        const groupList = groups.slice(0, 10).map((group: any, index: number) => 
          `${index + 1}. **${group.profile?.name || 'Unnamed Group'}**\n   Type: ${group.type || 'USER_GROUP'}\n   Members: ${group.profile?.membershipCount || 'Unknown'}`
        ).join('\n\n');

        return {
          success: true,
          data: {
            response: `**👥 Your Manageable Groups**\n\n✅ **Found ${groups.length} groups:**\n\n${groupList}${groups.length > 10 ? `\n\n... and ${groups.length - 10} more groups` : ''}\n\n**Available Actions:**\n• "List users in [group name]" - Show group members\n• "Add user to [group name]" - Add user to group\n• "Remove user from [group name]" - Remove user from group\n\n*Admin session active - all operations audited*`
          }
        };
      } else {
        return {
          success: true,
          data: {
            response: `**👥 Groups You Can Manage**\n\n⚠️ No groups found under your management.\n\nThis could mean:\n• No groups are assigned to your custom role\n• Group permissions may need configuration\n• Check with your Okta administrator\n\n*Admin session active*`
          }
        };
      }
    } catch (error) {
      console.error('Group management error:', error);
      return {
        success: true,
        data: {
          response: `**❌ Group Access Error**\n\nCould not retrieve groups: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check:\n• Your group management permissions\n• Network connectivity\n• Contact your administrator if the issue persists`
        }
      };
    }
  }

  private async handleCatalogRequest(user: User, tokens: OktaTokens): Promise<any> {
    console.log('📋 Processing catalog request');
    
    try {
      // Use Management API token instead of user's access token for API calls
      const authHeader = this.oktaApiToken 
        ? `SSWS ${this.oktaApiToken}`
        : `Bearer ${tokens.accessToken}`;
        
      console.log('🔑 Using API authentication:', this.oktaApiToken ? 'Management API Token' : 'User Access Token');
      
      // Try IGA catalog API first (proper endpoint)
      const response = await fetch(`https://${this.oktaDomain}/api/v1/governance/catalog`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`⚠️ Governance catalog failed (${response.status}): ${errorText}`);
        
        // Try the legacy IGA endpoint
        console.log('🔄 Trying legacy IGA catalog endpoint...');
        const igaResponse = await fetch(`https://${this.oktaDomain}/api/v1/iga/catalog/entries?filter=type+eq+%22APPLICATION%22`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
          }
        });
        
        if (igaResponse.ok) {
          const igaCatalog = await igaResponse.json();
          console.log('✅ Legacy IGA catalog successful:', igaCatalog.length);
          
          if (igaCatalog && igaCatalog.length > 0) {
            const catalogList = igaCatalog.slice(0, 15).map((entry: any, index: number) => 
              `${index + 1}. **${entry.displayName || entry.name || 'Unknown App'}**\n   ${entry.requestable === false ? '🔒 Not Requestable' : '✅ Available for Request'}\n   Type: ${entry.type || 'Application'}`
            ).join('\n\n');

            return {
              success: true,
              data: {
                response: `**🏪 IGA Application Catalog**\n\n✅ **Found ${igaCatalog.length} applications:**\n\n${catalogList}${igaCatalog.length > 15 ? `\n\n... and ${igaCatalog.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Say "request access to [app name]" to submit a request\n• All applications above are from your Okta IGA catalog\n\n*Retrieved from IGA catalog API*`
              }
            };
          }
        }
        
        console.log('⚠️ Both governance and legacy IGA catalog failed, trying apps API fallback');
        
        // Fallback to regular apps API
        const appsResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json'
          }
        });

        if (!appsResponse.ok) {
          throw new Error(`Apps API error: ${appsResponse.status}`);
        }

        const apps = await appsResponse.json();
        const requestableApps = apps.filter((app: any) => app.status === 'ACTIVE');

        if (requestableApps.length > 0) {
          const appList = requestableApps.slice(0, 15).map((app: any, index: number) => 
            `${index + 1}. **${app.label || app.name}**\n   Status: ${app.status}\n   Type: ${app.signOnMode || 'Application'}`
          ).join('\n\n');

          return {
            success: true,
            data: {
              response: `**🏪 Available Applications (Apps API)**\n\n✅ **Found ${requestableApps.length} active applications:**\n\n${appList}${requestableApps.length > 15 ? `\n\n... and ${requestableApps.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Contact your administrator to request access\n• Note: This list shows all active applications, not all may be requestable\n\n*Using Apps API fallback as IGA catalog is not accessible*`
            }
          };
        }
      } else {
        const catalog = await response.json();
        console.log('✅ Catalog entries fetched:', catalog.length);

        if (catalog && catalog.length > 0) {
          const catalogList = catalog.slice(0, 15).map((entry: any, index: number) => 
            `${index + 1}. **${entry.displayName || entry.name || 'Unknown App'}**\n   ${entry.requestable === false ? '🔒 Not Requestable' : '✅ Available for Request'}\n   Type: ${entry.type || 'Application'}`
          ).join('\n\n');

          return {
            success: true,
            data: {
              response: `**🏪 IGA Application Catalog**\n\n✅ **Found ${catalog.length} applications:**\n\n${catalogList}${catalog.length > 15 ? `\n\n... and ${catalog.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Say "request access to [app name]" to submit a request\n• All applications above are from your Okta IGA catalog\n\n*Retrieved from official IGA catalog API*`
            }
          };
        }
      }

      // If no data found from either API
      return {
        success: true,
        data: {
          response: `**📋 No Applications Available**\n\nNo requestable applications found in the catalog.\n\nThis may indicate:\n• IGA catalog is not configured\n• No applications are published for self-service\n• Permissions may need adjustment\n\nContact your Okta administrator for access to applications.`
        }
      };

    } catch (error) {
      console.error('Catalog request error:', error);
      return {
        success: true,
        data: {
          response: `**❌ Catalog Access Error**\n\nCould not retrieve application catalog: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check:\n• Your IGA permissions\n• Network connectivity\n• Contact your administrator if the issue persists`
        }
      };
    }
  }

  private async handleAccessLevelInquiry(user: User, tokens: OktaTokens): Promise<any> {
    const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
    const capabilities = this.getUserCapabilities(user, !!hasAdminSession);
    
    // Use the most specific custom role or format the primary role
    const roleDisplay = user.allRoles && user.allRoles.length > 0 
      ? user.allRoles.find(role => 
          !['Super Admin', 'App Admin', 'Group Admin', 'User Admin', 'super_admin', 'app_owner', 'group_admin'].includes(role)
        ) || user.allRoles[0]
      : this.formatRoleName(user.role);

    return {
      success: true,
      data: {
        response: `**🔑 Your Current Access Level**\n\n**Role:** ${roleDisplay}\n**Admin Session:** ${hasAdminSession ? '✅ Active' : '❌ Not Active'}\n\n**Current Capabilities:**\n${capabilities.map(cap => `• ${cap}`).join('\n')}\n\n${!hasAdminSession && (user.role === 'group_admin' || user.allRoles?.some(role => role.toLowerCase().includes('group'))) ? 
          '\n**To unlock full capabilities:**\n• Try requesting group management operations\n• System will prompt for admin authentication when needed' : 
          '\n**Available Actions:**\n• Request access to applications\n• Review your 30-day access patterns'
        }`
      }
    };
  }

  private parseGovernanceIntent(message: string): GovernanceAction {
    const lowerMessage = message.toLowerCase();
    
    // Campaign creation patterns
    if (lowerMessage.includes('campaign') && (lowerMessage.includes('create') || lowerMessage.includes('start'))) {
      const appMatch = lowerMessage.match(/(?:for|campaign for)\s+(\w+)/i);
      const frequencyMatch = lowerMessage.match(/every\s+(\d+\s+\w+)/i);
      const reviewerMatch = lowerMessage.match(/(?:with|reviewer)\s+(\w+)(?:\s+as\s+reviewer)?/i);
      
      return {
        type: 'campaign',
        appName: appMatch?.[1],
        frequency: frequencyMatch?.[1] || '3 months',
        reviewer: reviewerMatch?.[1] || 'manager'
      };
    }

    // Access review patterns  
    if (lowerMessage.includes('access') && (lowerMessage.includes('30 days') || lowerMessage.includes('review'))) {
      const daysMatch = lowerMessage.match(/(\d+)\s+days/);
      return {
        type: 'access_review',
        days: daysMatch ? parseInt(daysMatch[1]) : 30
      };
    }

    // List governance apps
    if (lowerMessage.includes('governance') && (lowerMessage.includes('apps') || lowerMessage.includes('applications'))) {
      return { type: 'list_apps' };
    }

    // List catalog entries
    if (lowerMessage.includes('catalog') || lowerMessage.includes('access request')) {
      return { type: 'list_catalog' };
    }

    // Submit access request
    if (lowerMessage.includes('submit') && lowerMessage.includes('entry')) {
      const entryMatch = lowerMessage.match(/entry\s+([a-zA-Z0-9]+)/);
      const justificationMatch = lowerMessage.match(/justification:\s*(.+)$/);
      
      return {
        type: 'access_request',
        entryId: entryMatch?.[1],
        justification: justificationMatch?.[1]
      };
    }

    // Revoke access
    if (lowerMessage.includes('revoke') || lowerMessage.includes('remove')) {
      return { type: 'revoke_access' };
    }

    return { type: 'list_apps' }; // Default fallback
  }



  private async performAccessReview(analysis: any, user: User, tokens: OktaTokens): Promise<any> {
    try {
      const days = analysis.parameters?.timeframe ? 30 : 30;
      
      // Get user's access history
      const response = await this.getUserAccessHistory(user, tokens, days);
      
      if (!response.success || !response.data?.length) {
        return {
          success: true,
          data: {
            response: `No application access found in the last ${days} days. Your access appears to be clean! 🎉`
          }
        };
      }

      // Group access by application
      const appAccess: { [key: string]: any } = {};
      response.data.forEach((log: any) => {
        const appName = log.target?.[0]?.displayName || 'Unknown App';
        if (!appAccess[appName]) {
          appAccess[appName] = {
            name: appName,
            id: log.target?.[0]?.id,
            lastAccess: log.published,
            accessCount: 0
          };
        }
        appAccess[appName].accessCount++;
        
        // Keep most recent access date
        if (new Date(log.published) > new Date(appAccess[appName].lastAccess)) {
          appAccess[appName].lastAccess = log.published;
        }
      });

      const apps = Object.values(appAccess);
      const appList = apps.map((app: any) => 
        `• **${app.name}** - Last accessed: ${new Date(app.lastAccess).toLocaleDateString()} (${app.accessCount} times)`
      ).join('\n');

      return {
        success: true,
        data: {
          response: `📋 **Access Review for Last ${days} Days**\n\nYou accessed these governance-enabled applications:\n\n${appList}\n\n**What would you like to do?**\n• Say "keep access to [app name]" to maintain access\n• Say "revoke access to [app name]" to remove access\n• Say "keep all access" or "revoke all access" for bulk actions`,
          apps: apps
        }
      };
    } catch (error) {
      console.error('Access review error:', error);
      return {
        success: false,
        error: "Failed to perform access review. Please try again."
      };
    }
  }

  private async listGovernanceApps(user: User, tokens: OktaTokens): Promise<any> {
    try {
      const response = await this.callOktaAPI(
        '/api/v1/apps?filter=features.governance eq "ENABLED"', 
        'GET', 
        null, 
        this.oktaApiToken,
        'SSWS'
      );

      if (response.ok) {
        const apps = await response.json();
        return {
          success: true,
          data: apps
        };
      } else {
        return {
          success: false,
          error: `Failed to fetch governance apps: ${response.status}`
        };
      }
    } catch (error) {
      console.error('List governance apps error:', error);
      return {
        success: false,
        error: "Failed to list governance applications."
      };
    }
  }

  private async listCatalogEntries(user: User, tokens: OktaTokens): Promise<any> {
    try {
      const response = await this.callOktaAPI(
        '/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=50',
        'GET',
        null,
        tokens.accessToken
      );

      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || data;
        
        if (entries.length === 0) {
          return {
            success: true,
            data: {
              response: "No resources are currently available for access requests. Contact your administrator to add resources to the catalog."
            }
          };
        }

        const entryList = entries.map((entry: any) => 
          `• **${entry.displayName || entry.name}** (ID: ${entry.id})\n  ${entry.description || 'No description available'}`
        ).join('\n\n');

        return {
          success: true,
          data: {
            response: `📚 **Available Resources for Access Requests:**\n\n${entryList}\n\n**To request access, say:** "Request access to [resource name]" or provide the resource ID.`,
            entries: entries
          }
        };
      } else {
        return {
          success: false,
          error: `Failed to fetch catalog: ${response.status}`
        };
      }
    } catch (error) {
      console.error('List catalog entries error:', error);
      return {
        success: false,
        error: "Failed to list catalog entries."
      };
    }
  }

  private async submitAccessRequest(intent: GovernanceAction, user: User, tokens: OktaTokens): Promise<any> {
    try {
      if (!intent.entryId) {
        return {
          success: false,
          error: "Entry ID is required to submit access request."
        };
      }

      const requestBody = {
        entryId: intent.entryId,
        justification: intent.justification || 'Access requested through Okta Assistant'
      };

      const response = await this.callOktaAPI(
        '/governance/api/v2/my/requests',
        'POST',
        requestBody,
        tokens.accessToken
      );

      if (response.ok) {
        const request = await response.json();
        return {
          success: true,
          data: {
            response: `✅ **Access request submitted successfully!**\n\n**Request Details:**\n• Request ID: ${request.id}\n• Status: ${request.requestStatus}\n• Justification: ${requestBody.justification}\n\nYour request has been sent for approval. You'll be notified when it's processed.`
          }
        };
      } else {
        return {
          success: false,
          error: `Failed to submit access request: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      console.error('Submit access request error:', error);
      return {
        success: false,
        error: "Failed to submit access request. Please try again."
      };
    }
  }

  private async revokeAccess(intent: GovernanceAction, user: User, tokens: OktaTokens): Promise<any> {
    try {
      // This would need specific app and user context
      return {
        success: true,
        data: {
          response: "Access revocation requires specific application details. Please specify which application access you'd like to revoke, and I'll help you with the process."
        }
      };
    } catch (error) {
      console.error('Revoke access error:', error);
      return {
        success: false,
        error: "Failed to revoke access. Please try again."
      };
    }
  }

  private async getUserAccessHistory(user: User, tokens: OktaTokens, days: number): Promise<any> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get user info first
      const userResponse = await this.callOktaAPI('/api/v1/users/me', 'GET', null, tokens.accessToken);
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        
        // Get system logs for user access
        const logsResponse = await this.callOktaAPI(
          `/api/v1/logs?filter=actor.id eq "${userData.id}" and eventType eq "user.session.access_app" and published gt "${startDate.toISOString()}"&limit=1000`,
          'GET',
          null,
          this.oktaApiToken,
          'SSWS'
        );

        if (logsResponse.ok) {
          const logs = await logsResponse.json();
          return {
            success: true,
            data: logs
          };
        }
      }

      return {
        success: false,
        error: "Failed to fetch access history."
      };
    } catch (error) {
      console.error('Get user access history error:', error);
      return {
        success: false,
        error: "Failed to get access history."
      };
    }
  }

  private async callOktaAPI(endpoint: string, method: string, body?: any, token?: string, authType: 'Bearer' | 'SSWS' = 'Bearer'): Promise<Response> {
    const url = `https://${this.oktaDomain}${endpoint}`;
    
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `${authType} ${token}`;
    }

    return await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  }

  private hasGovernancePermissions(user: User): boolean {
    const allowedRoles = ['super_admin', 'app_owner', 'org_admin'];
    return allowedRoles.includes(user.role);
  }

  private parseFrequencyToSchedule(frequency: string): any {
    // Convert human-readable frequency to cron-like schedule
    if (frequency.includes('month')) {
      return { type: 'monthly', interval: 1 };
    }
    if (frequency.includes('week')) {
      return { type: 'weekly', interval: 1 };
    }
    if (frequency.includes('quarter')) {
      return { type: 'quarterly', interval: 1 };
    }
    return { type: 'monthly', interval: 3 }; // Default to quarterly
  }

  private getUserAccessLevel(user: User): 'super_admin' | 'app_owner' | 'regular_user' | 'no_access' {
    if (user.role === 'super_admin') return 'super_admin';
    if (user.role === 'app_owner') return 'app_owner';
    if (user.role === 'regular_user') return 'regular_user';
    return 'no_access';
  }

  private getAvailableActions(accessLevel: string): string[] {
    switch (accessLevel) {
      case 'super_admin':
        return ['governance campaigns', 'access reviews', 'user management', 'access requests', 'app management'];
      case 'app_owner':
        return ['governance campaigns (owned apps)', 'access reviews', 'access requests'];
      case 'regular_user':
        return ['access reviews (own access)', 'access requests'];
      default:
        return ['access requests'];
    }
  }

  private async handleNoAccessUser(message: string, user: User, tokens: OktaTokens): Promise<any> {
    const response = await this.ollama.generateResponse(
      message,
      `User has no admin access. They can only request access to applications. Suggest submitting an access request.`
    );

    return {
      success: true,
      data: {
        response: `**Access Level: No Administrative Access**\n\n${response}\n\n**Available Actions:**\n• Request access to applications\n• View your current access\n\nWould you like me to show you available applications to request access to?`,
        accessLevel: 'no_access',
        suggestedActions: ['Show available applications', 'Request access to specific app']
      }
    };
  }

  private async suggestAccessRequest(user: User, feature: string): Promise<any> {
    return {
      success: true,
      data: {
        response: `**Access Level: Regular User**\n\nYou don't have permission for ${feature}. This feature requires administrative privileges.\n\n**What you can do:**\n• Request access to applications\n• Review your own application access\n• View your access history\n\n**To get administrative access:**\nContact your Okta administrator to request elevated permissions.\n\nWould you like me to help you with something else?`,
        accessLevel: 'regular_user',
        suggestedActions: ['Show my access', 'Request app access', 'Show available apps']
      }
    };
  }

  async handleAccessRequest(analysis: any, user: User, tokens: OktaTokens): Promise<any> {
    // Implementation for access requests - uses session tokens
    return {
      success: true,
      data: {
        response: `**📝 Access Request**\n\nAccess request functionality will be processed using your session token for proper audit logging.\n\nNext: Please specify which application you'd like to request access to.`
      }
    };
  }

  private async handleUserManagement(analysis: any, user: User, tokens: OktaTokens): Promise<any> {
    const response = await this.ollama.generateResponse(
      'Help with user management tasks',
      `User is ${user.role}. They want to manage users. Provide appropriate guidance based on their role.`
    );

    return {
      success: true,
      data: { response }
    };
  }
}
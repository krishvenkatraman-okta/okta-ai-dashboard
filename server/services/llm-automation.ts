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
    // Use Ollama for intelligent intent analysis
    const analysis = await this.ollama.analyzeIntent(message);
    
    // Determine if this requires admin privileges
    const isAdminOperation = this.isAdminOperation(analysis.intent);
    const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
    
    // Handle admin operations
    if (isAdminOperation && !hasAdminSession) {
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
        return await this.createGovernanceCampaign(analysis, user, tokens, hasAdminSession);
      case 'user_management':
        // Admin operation - requires admin session
        return await this.handleUserManagement(analysis, user, tokens, hasAdminSession);
      case 'group_management':
        // Admin operation - requires admin session
        return await this.handleGroupManagement(analysis, user, tokens, hasAdminSession);
      default:
        // General response with appropriate capabilities
        const capabilities = this.getUserCapabilities(user, hasAdminSession);
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
      return this.requireAdminSession('group_management', user);
    }

    return {
      success: true,
      data: {
        response: `**🔑 Group Management**\n\nAdmin session active. I can help you with:\n• List manageable groups\n• Add/remove users from groups\n• View group memberships\n• Group access analytics\n\nWhat group operation would you like to perform?`
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

  private async createGovernanceCampaign(analysis: any, user: User, tokens: OktaTokens): Promise<any> {
    try {
      // Check user permissions
      if (!this.hasGovernancePermissions(user)) {
        return {
          success: false,
          error: "You don't have permission to create governance campaigns. Contact your administrator."
        };
      }

      // Get governance-enabled apps first
      const apps = await this.listGovernanceApps(user, tokens);
      
      if (!apps.success || !apps.data?.length) {
        return {
          success: false,
          error: "No governance-enabled applications found. Please contact your administrator to enable governance for your applications."
        };
      }

      let targetApp = null;
      if (intent.appName) {
        targetApp = apps.data.find((app: any) => 
          app.name?.toLowerCase().includes(intent.appName!.toLowerCase()) ||
          app.label?.toLowerCase().includes(intent.appName!.toLowerCase())
        );
      }

      if (intent.appName && !targetApp) {
        // Show available apps if specific app not found
        const appNames = apps.data.map((app: any) => app.name || app.label).join(', ');
        return {
          success: false,
          error: `Application "${intent.appName}" not found or not governance-enabled. Available apps: ${appNames}`
        };
      }

      // If no specific app, show available options
      if (!targetApp) {
        const appList = apps.data.map((app: any) => `• ${app.name || app.label}`).join('\n');
        return {
          success: true,
          data: {
            response: `Here are your governance-enabled applications:\n\n${appList}\n\nTo create a campaign, say: "Create a campaign for [app name] every 3 months with manager as reviewer"`
          }
        };
      }

      // Create the campaign
      const campaignData = {
        name: `${targetApp.name || targetApp.label} Access Review`,
        description: `Automated access review campaign for ${targetApp.name || targetApp.label}`,
        applicationId: targetApp.id,
        schedule: this.parseFrequencyToSchedule(intent.frequency || '3 months'),
        reviewerType: intent.reviewer === 'manager' ? 'MANAGER' : 'USERNAME',
        reviewer: intent.reviewer !== 'manager' ? intent.reviewer : undefined
      };

      const response = await this.callOktaAPI('/governance/api/v1/campaigns', 'POST', campaignData, tokens.accessToken);
      
      if (response.ok) {
        const campaign = await response.json();
        return {
          success: true,
          data: {
            response: `✅ Successfully created governance campaign "${campaignData.name}"!\n\n**Details:**\n• Application: ${targetApp.name || targetApp.label}\n• Frequency: ${intent.frequency}\n• Reviewer: ${intent.reviewer}\n• Campaign ID: ${campaign.id}\n\nThe campaign will automatically review access permissions based on your schedule.`
          }
        };
      } else {
        return {
          success: false,
          error: `Failed to create campaign: ${response.status} ${response.statusText}`
        };
      }
    } catch (error) {
      console.error('Campaign creation error:', error);
      return {
        success: false,
        error: "Failed to create governance campaign. Please try again or contact support."
      };
    }
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

  private async handleAccessRequest(analysis: any, user: User, tokens: OktaTokens): Promise<any> {
    // All users can make access requests
    return await this.listCatalogEntries(user, tokens);
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
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
    try {
      console.log('🔍 LLM processing request:', message);
      console.log('🔍 Message type:', typeof message, 'Length:', message.length);
      
      // Check for explicit patterns first (higher priority than LLM)
      const lowerMessage = message.toLowerCase().trim();
      console.log('🔍 Normalized message:', `"${lowerMessage}"`);

      // Admin session start patterns - highest priority
      const adminSessionPatterns = ['start admin session', 'admin session', 'establish admin session'];
      const foundAdminPattern = adminSessionPatterns.find(pattern => lowerMessage.includes(pattern));
      
      if (foundAdminPattern) {
        console.log('🔐 CRITICAL: Admin session start pattern detected:', foundAdminPattern);
        console.log('🔐 BYPASSING OLLAMA - Direct admin session start');
        return await this.handleAdminSessionStart(user);
      }
      
      // Group management patterns - second highest priority with detailed logging
      const groupPatterns = ['group management', 'group operations', 'show my groups', 'manage groups'];
      const foundPattern = groupPatterns.find(pattern => lowerMessage.includes(pattern));
      
      if (foundPattern) {
        console.log('🎯 CRITICAL: Group management pattern detected:', foundPattern);
        console.log('🎯 BYPASSING OLLAMA - Direct pattern match');
        try {
          const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
          
          if (!hasAdminSession) {
            console.log('🔐 No admin session - requiring admin auth');
            return this.requireAdminSession('group_management', user);
          }
          
          return await this.handleGroupManagement({ intent: 'group_management' }, user, tokens, hasAdminSession);
        } catch (groupError) {
          console.error('❌ Group management handling failed:', groupError);
          return {
            success: false,
            data: { 
              response: `**👥 Group Management**\n\nI understand you want to view your groups. However, I encountered a technical issue processing this request.\n\nPlease try:\n• Refreshing the page and trying again\n• Using "list my groups" instead\n• Checking that you have proper group management permissions` 
            }
          };
        }
      }
      
      console.log('🔍 No group management pattern found, continuing to other checks...');
      
      // Entitlement request patterns - check for "request [specific entitlement]" format
      if (lowerMessage.startsWith('request ') && !lowerMessage.includes('request access to ')) {
        const entitlementMatch = message.match(/^request\s+(.+)$/i);
        if (entitlementMatch) {
          const entitlementName = entitlementMatch[1].trim();
          console.log('🎯 PRIORITY: Entitlement request pattern detected:', entitlementName);
          try {
            const result = await this.handleEntitlementRequest(entitlementName, user, tokens);
            console.log('✅ Entitlement request completed successfully');
            return result;
          } catch (entitlementError) {
            console.error('❌ Entitlement request handling failed:', entitlementError);
            return {
              success: false,
              data: { 
                response: `**📋 Access Request Error**\n\nI encountered an issue processing your request for "${entitlementName}".\n\n**Error details:** ${entitlementError instanceof Error ? entitlementError.message : 'Unknown error'}\n\nPlease try:\n• "list available applications" to see available options\n• Using the exact entitlement name\n• Contacting your administrator if the issue persists` 
              }
            };
          }
        }
      }

      // Return early if patterns were detected to prevent Ollama fallback
      console.log('🔍 No priority patterns matched, continuing to LLM analysis...');

    // Use Ollama for intelligent intent analysis (with fallback on failure)
    let analysis;
    try {
      analysis = await this.ollama.analyzeIntent(message);
      console.log('🧠 Intent analysis result:', analysis);
    } catch (error) {
      console.log('❌ LLM processing failed, using fallback classification');
      // Fallback classification based on message content
      analysis = this.fallbackIntentClassification(message);
      console.log('🔄 Fallback classification result:', analysis);
    }
    
    // Handle based on the analyzed intent first, then fall back to pattern matching
    if (analysis.intent === 'admin_session_start') {
      console.log('🔐 Admin session start request detected');
      return await this.handleAdminSessionStart(user);
    }
    
    if (analysis.intent === 'entitlement_request') {
      console.log('🎯 LLM detected entitlement request');
      // Extract entitlement name from message
      const entitlementMatch = message.match(/^request\s+(.+)$/i);
      if (entitlementMatch) {
        const entitlementName = entitlementMatch[1].trim();
        return await this.handleEntitlementRequest(entitlementName, user, tokens);
      }
    }
    
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
    
    // Fallback to pattern matching for missed cases (lowerMessage already declared above)
    
    // Additional catalog/application listing requests
    if (lowerMessage.includes('list available applications') || 
        lowerMessage.includes('applications to request') ||
        lowerMessage.includes('available apps') ||
        lowerMessage.includes('show catalog')) {
      console.log('📋 Pattern matched catalog request');
      return await this.handleCatalogRequest(user, tokens);
    }

    // Check for specific application access requests
    if (lowerMessage.includes('request access to ')) {
      const appMatch = message.match(/request access to (.+?)(?:\s|$)/i);
      if (appMatch) {
        const appName = appMatch[1].trim();
        console.log('🎯 Pattern matched application access request:', appName);
        return await this.handleApplicationEntitlements(appName, user, tokens);
      }
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
        // Check if specific application is mentioned
        const appMatch = message.match(/request access to (.+?)(?:\s|$)/i);
        if (appMatch) {
          const appName = appMatch[1].trim();
          console.log('🎯 Application specified:', appName);
          return await this.handleApplicationEntitlements(appName, user, tokens);
        }
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
    } catch (error) {
      console.error('❌ CRITICAL: LLM automation service failed:', error);
      console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        success: false,
        data: { 
          response: `I encountered a technical issue processing your request: "${message}"\n\nPlease try:\n• Refreshing the page\n• Using simpler commands like "list available applications"\n• Contacting support if the issue persists\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }
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
    
    // Get actual user roles for proper display
    const userRole = this.getUserDisplayRole(user);
    
    return {
      success: false,
      requiresAdminAuth: true,
      data: {
        response: `**🔐 Admin Session Required**\n\nTo perform ${intent.replace('_', ' ')} operations, you need an active admin session.\n\n**Your Current Access:**\n• Role: ${userRole}\n• Can perform: 30-day access reviews, access requests\n\n**To unlock admin capabilities:**\n1. Click "Start Admin Session" below\n2. Authenticate in the admin portal\n3. Return here to continue\n\nThis ensures all admin actions are properly audited in Okta system logs.`,
        action: 'admin_auth_required',
        adminUrl: `https://${adminDomain}/admin/dashboard`,
        intent: intent
      }
    };
  }

  private getUserDisplayRole(user: User): string {
    // Check if user has allRoles (custom roles) property
    if (user.allRoles && Array.isArray(user.allRoles) && user.allRoles.length > 0) {
      // Filter out standard admin roles to get custom roles
      const customRoles = user.allRoles.filter((role: string) => 
        !['Super Admin', 'App Admin', 'Group Admin', 'User Admin', 'Help Desk Admin', 
          'Read Only Admin', 'Mobile Admin', 'API Access Admin', 'Report Admin', 
          'Group Membership Admin'].includes(role)
      );
      
      if (customRoles.length > 0) {
        return customRoles[0]; // Return first custom role
      }
      
      // If no custom roles, return highest standard role
      if (user.allRoles.includes('Super Admin')) return 'Super Admin';
      if (user.allRoles.includes('App Admin')) return 'App Admin';
      if (user.allRoles.includes('Group Admin') || user.allRoles.includes('Group Membership Admin')) return 'Group Admin';
      return user.allRoles[0]; // Fallback to first role
    }
    
    // Fallback to role property formatting
    return this.formatRoleName(user.role);
  }

  private formatRoleName(role: string): string {
    return role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private fallbackIntentClassification(message: string) {
    const lowerMessage = message.toLowerCase();
    
    // Check for admin session requests
    if (lowerMessage.includes('start admin session') || 
        lowerMessage.includes('admin session') ||
        lowerMessage.includes('establish admin session')) {
      return { intent: 'admin_session_start', confidence: 0.9 };
    }
    
    // Check for entitlement requests first
    if (lowerMessage.startsWith('request ') && !lowerMessage.includes('request access to ')) {
      return { intent: 'entitlement_request', confidence: 0.9 };
    }
    
    // Check for group management patterns
    const groupPatterns = ['group management', 'group operations', 'show my groups', 'manage groups'];
    if (groupPatterns.some(pattern => lowerMessage.includes(pattern))) {
      return { intent: 'group_management', confidence: 0.9 };
    }
    
    // Check for catalog requests
    if (lowerMessage.includes('list available applications') || 
        lowerMessage.includes('applications to request') ||
        lowerMessage.includes('available apps') ||
        lowerMessage.includes('show catalog')) {
      return { intent: 'catalog_request', confidence: 0.8 };
    }
    
    // Check for access level inquiries
    if (lowerMessage.includes('access level') || lowerMessage.includes('current access') ||
        lowerMessage.includes('what can i do')) {
      return { intent: 'access_level_inquiry', confidence: 0.8 };
    }
    
    // Check for 30-day patterns
    if (lowerMessage.includes('30 day') || lowerMessage.includes('30-day') ||
        lowerMessage.includes('access review') || lowerMessage.includes('unused apps')) {
      return { intent: 'access_review', confidence: 0.7 };
    }
    
    // Final fallback - don't default to access_review
    return { intent: 'general_inquiry', confidence: 0.3 };
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

  async handleAdminSessionStart(user: User): Promise<any> {
    try {
      console.log('🔐 Handling admin session start for user:', user.name);
      
      // Get actual user role for display
      const userRole = this.getUserDisplayRole(user);
      
      return {
        success: true,
        requiresAdminAuth: true,
        data: {
          response: `**🔐 Admin Authentication Required**\n\n**Your Role:** ${userRole}\n\n**Starting admin session...**\n\nI'm opening the admin authentication flow. Please:\n\n1. Complete the step-up authentication\n2. Grant admin permissions\n3. Return here when authentication is complete\n\n*This creates a secure admin session with proper audit logging.*`,
          action: 'admin_oauth_flow',
          needsAdminAuth: true
        }
      };
    } catch (error) {
      console.error('❌ Error handling admin session start:', error);
      return {
        success: false,
        data: {
          response: `**❌ Admin Session Error**\n\nUnable to initiate admin session.\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try:\n• Refreshing the page\n• Contacting your administrator\n• Checking your admin permissions`
        }
      };
    }
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
      console.log('📋 Fetching catalog from:', `https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not%28parent+pr%29&limit=20`);
      
      // Use the correct governance catalog endpoint
      const response = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not%28parent+pr%29&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`⚠️ Governance catalog failed (${response.status}): ${errorText}`);
        
        // Try alternative catalog endpoints
        console.log('🔄 Trying alternative IGA catalog endpoint...');
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
        
        console.log('⚠️ Both governance catalog endpoints failed, trying apps API fallback');
        
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
        const catalogResponse = await response.json();
        console.log('✅ Governance catalog response:', JSON.stringify(catalogResponse, null, 2));
        
        const catalog = catalogResponse.data || catalogResponse.resources || catalogResponse.entries || catalogResponse;
        console.log('✅ Catalog entries fetched:', catalog?.length);

        if (catalog && catalog.length > 0) {
          // Filter out Collections, show only Applications as requestable
          const applications = catalog.filter((entry: any) => entry.label !== 'Collection');
          
          const catalogList = applications.slice(0, 15).map((entry: any, index: number) => 
            `${index + 1}. **${entry.name || entry.displayName || 'Unknown App'}**\n   ✅ Available for Access Request\n   Type: ${entry.label || entry.type || entry.entryType || 'Application'}\n   ID: \`${entry.id}\``
          ).join('\n\n');

          return {
            success: true,
            data: {
              response: `**🏪 Available Applications**\n\n📋 **Found ${applications.length} requestable applications:**\n\n${catalogList}${applications.length > 15 ? `\n\n... and ${applications.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Say "request access to [application name]" to start the request process\n• Example: "request access to Adobe" or "request access to Salesforce.com"\n\n*All applications above support access requests through the governance workflow*`
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

  private async submitGovernanceRequest(intent: GovernanceAction, user: User, tokens: OktaTokens): Promise<any> {
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

  // Interactive access request workflow methods
  async handleApplicationEntitlements(appName: string, user: User, tokens: OktaTokens): Promise<any> {
    try {
      console.log('🔍 Fetching application entitlements for:', appName);

      // First, get the catalog to find the app ID
      const authHeader = this.oktaApiToken 
        ? `SSWS ${this.oktaApiToken}`
        : `Bearer ${tokens.accessToken}`;

      const catalogResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not%28parent+pr%29&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!catalogResponse.ok) {
        throw new Error(`Catalog API error: ${catalogResponse.status}`);
      }

      const catalogData = await catalogResponse.json();
      const catalog = catalogData.data || catalogData.resources || catalogData.entries || catalogData;
      
      // Find the application by name (case-insensitive)
      const app = catalog.find((entry: any) => 
        entry.name?.toLowerCase() === appName.toLowerCase() ||
        entry.displayName?.toLowerCase() === appName.toLowerCase()
      );

      if (!app) {
        return {
          success: false,
          data: {
            response: `**❌ Application Not Found**\n\nCould not find "${appName}" in the catalog.\n\n**Available applications:**\n${catalog.filter((e: any) => e.label !== 'Collection').map((e: any) => `• ${e.name}`).join('\n')}\n\nPlease try again with the exact application name.`
          }
        };
      }

      // Fetch entitlements for this application
      const entitlementsResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=parent+eq+%22${app.id}%22&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!entitlementsResponse.ok) {
        throw new Error(`Entitlements API error: ${entitlementsResponse.status}`);
      }

      const entitlementsData = await entitlementsResponse.json();
      const entitlements = entitlementsData.data || entitlementsData.resources || entitlementsData.entries || entitlementsData;

      if (!entitlements || entitlements.length === 0) {
        return {
          success: false,
          data: {
            response: `**📱 ${app.name}**\n\n❌ **No Available Entitlements**\n\nThis application has no available entitlements for self-service requests.\n\nPlease contact your administrator to request access to ${app.name}.`
          }
        };
      }

      const entitlementsList = entitlements.slice(0, 10).map((ent: any, index: number) => 
        `${index + 1}. **${ent.name || ent.displayName || 'Unknown Entitlement'}**\n   ID: \`${ent.id}\`\n   ${ent.description || 'Standard access entitlement'}`
      ).join('\n\n');

      return {
        success: true,
        data: {
          response: `**📱 ${app.name} - Available Entitlements**\n\n🎯 **Found ${entitlements.length} available entitlements:**\n\n${entitlementsList}${entitlements.length > 10 ? `\n\n... and ${entitlements.length - 10} more entitlements` : ''}\n\n**Next Steps:**\n• Say "request [entitlement name]" to proceed with the request\n• Example: "request ${entitlements[0]?.name || 'Standard Access'}"\n\n*Select the entitlement that best matches your access needs*`
        }
      };

    } catch (error) {
      console.error('❌ Error fetching entitlements:', error);
      return {
        success: false,
        data: {
          response: `**❌ Error Fetching Entitlements**\n\nUnable to retrieve entitlements for ${appName}:\n\`${error}\`\n\nPlease try again or contact your administrator.`
        }
      };
    }
  }

  async handleEntitlementRequest(entitlementName: string, user: User, tokens: OktaTokens): Promise<any> {
    try {
      console.log('🎯 Processing entitlement request for:', entitlementName);
      
      // For governance API, we need to use management API token due to scope requirements
      // User attribution is maintained through the request payload
      const authHeader = this.oktaApiToken 
        ? `SSWS ${this.oktaApiToken}`
        : `Bearer ${tokens.accessToken}`;
      
      console.log('🔒 Auth method:', this.oktaApiToken ? 'Management API (SSWS)' : 'User session token');
      console.log('🔒 Note: Using management token for governance API access, user attribution via payload');

      // Step 1: Get all catalog items (applications)
      console.log('📋 Step 1: Getting catalog applications...');
      console.log('🔒 Auth header type:', authHeader.substring(0, 10) + '...');
      
      const catalogResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not%28parent+pr%29&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📋 Catalog API response status:', catalogResponse.status);
      if (!catalogResponse.ok) {
        const errorText = await catalogResponse.text();
        console.error('📋 Catalog API error details:', errorText);
      }

      if (!catalogResponse.ok) {
        throw new Error(`Catalog API error: ${catalogResponse.status}`);
      }

      const catalogData = await catalogResponse.json();
      const applications = catalogData.data || [];
      console.log(`📋 Found ${applications.length} applications in catalog`);

      // Step 2: Search through applications for the entitlement
      let foundEntitlement = null;
      let parentApp = null;

      console.log('🔍 Step 2: Searching for entitlement in applications...');
      for (const app of applications) {
        console.log(`🔍 Checking app: ${app.name} (${app.id})`);
        
        const entitlementsResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=parent+eq+%22${app.id}%22&limit=20`, {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (entitlementsResponse.ok) {
          const entitlementsData = await entitlementsResponse.json();
          const entitlements = entitlementsData.data || [];
          console.log(`📦 Found ${entitlements.length} entitlements in ${app.name}`);

          foundEntitlement = entitlements.find((ent: any) => 
            ent.name?.toLowerCase().includes(entitlementName.toLowerCase()) ||
            entitlementName.toLowerCase().includes(ent.name?.toLowerCase())
          );

          if (foundEntitlement) {
            parentApp = app;
            console.log(`✅ Found matching entitlement: ${foundEntitlement.name} in ${app.name}`);
            break;
          }
        }
      }

      if (!foundEntitlement || !parentApp) {
        return {
          success: false,
          data: {
            response: `**❌ Entitlement Not Found**\n\nCould not find "${entitlementName}" in any application catalog.\n\nPlease:\n1. Use "list available applications" to see available apps\n2. Check the exact entitlement name\n3. Contact your administrator if the entitlement should be available`
          }
        };
      }

      // Step 3: Get required fields for the entitlement
      console.log('📝 Step 3: Getting required fields for entitlement...');
      const fieldsResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${foundEntitlement.id}/request-fields`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!fieldsResponse.ok) {
        console.error('❌ Fields API error:', fieldsResponse.status);
        throw new Error(`Fields API error: ${fieldsResponse.status}`);
      }

      const fieldsData = await fieldsResponse.json();
      console.log('📝 Fields data received:', JSON.stringify(fieldsData, null, 2));

      const requiredFields = fieldsData.data || [];
      const riskAssessment = fieldsData.metadata?.riskAssessment;

      // Step 4: Check if user specified duration in request
      const durationMatch = entitlementName.match(/(?:for\s+)?(\d+)\s*(hour|day|week|month)s?/i);
      
      if (!durationMatch && requiredFields.some((f: any) => f.type === 'DURATION' && f.required)) {
        // User needs to specify duration - don't auto-submit
        const maxDurationField = requiredFields.find((f: any) => f.type === 'DURATION');
        const maxAllowed = maxDurationField?.maximumValue || 'P30D';
        
        return {
          success: true,
          requiresDuration: true,
          data: {
            response: `**⏰ Duration Required for ${foundEntitlement.name}**\n\n${parentApp.name} requires you to specify how long you need access.\n\n**Policy Limit:** Maximum ${maxAllowed === 'P30D' ? '30 days' : maxAllowed}\n\n**Please specify duration:**\n• "request ${entitlementName} for 2 hours"\n• "request ${entitlementName} for 1 day"\n• "request ${entitlementName} for 1 week"\n\n**Risk Assessment:** ${riskAssessment?.level || 'Standard'}\n${riskAssessment?.details ? `• ${riskAssessment.details}` : ''}`,
            entitlementId: foundEntitlement.id,
            entitlementName: foundEntitlement.name,
            parentApp: parentApp.name,
            maxDuration: maxAllowed
          }
        };
      }

      // Step 4: Build field values based on requirements
      const fieldValues = [];
      
      for (const field of requiredFields) {
        if (field.required) {
          let value = field.value; // Use default value if available
          
          // Handle duration fields specially
          if (field.type === 'DURATION') {
            if (durationMatch) {
              const durationValue = parseInt(durationMatch[1]);
              const durationUnit = durationMatch[2].toLowerCase();
              
              if (durationUnit === 'hour') {
                value = `PT${durationValue}H`;
              } else if (durationUnit === 'day') {
                value = `P${durationValue}D`;
              } else if (durationUnit === 'week') {
                value = `P${durationValue}W`;
              } else if (durationUnit === 'month') {
                value = `P${durationValue}M`;
              }
            } else {
              value = field.value || 'PT2H'; // Default to 2 hours
            }
          }
          
          fieldValues.push({
            id: field.id,
            value: value
          });
        }
      }

      console.log('📤 Step 4: Submitting request with field values:', JSON.stringify(fieldValues, null, 2));

      // Submit the request
      return await this.submitAccessRequest(foundEntitlement.id, fieldValues, user, tokens, parentApp.name, foundEntitlement.name, riskAssessment);

    } catch (error) {
      console.error('❌ Error processing entitlement request:', error);
      return {
        success: false,
        data: {
          response: `**❌ Request Processing Error**\n\nUnable to process request for ${entitlementName}:\n\`${error}\`\n\nPlease try again or contact your administrator.`
        }
      };
    }
  }

  async submitAccessRequest(entitlementId: string, fieldValues: any[], user: User, tokens: OktaTokens, appName: string, entitlementName: string, riskAssessment?: any): Promise<any> {
    try {
      console.log('📤 Submitting access request for entitlement:', entitlementId);
      console.log('📄 Field values:', fieldValues);

      // Try user session token first, fallback to management API with user impersonation
      let authHeader: string;
      let authMethod: string;
      let headers: any = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      
      if (tokens.accessToken) {
        authHeader = `Bearer ${tokens.accessToken}`;
        authMethod = 'User session token';
        headers['Authorization'] = authHeader;
        console.log('🔒 Using USER SESSION TOKEN for access request (user attribution)');
      } else if (this.oktaApiToken) {
        authHeader = `SSWS ${this.oktaApiToken}`;
        authMethod = 'Management API with user context';
        headers['Authorization'] = authHeader;
        headers['X-Okta-User'] = user.id; // Impersonate user for proper attribution
        console.log('🔒 Using MANAGEMENT API with user impersonation for access request');
      } else {
        throw new Error('No authentication token available for access request');
      }

      // Use correct API format per Okta documentation with proper user attribution
      const requestPayload = {
        requestedFor: {
          externalId: user.id // The user who needs access
        },
        requestedBy: {
          externalId: user.sub || user.id // The OIDC sub claim or user ID who is submitting
        },
        requested: {
          entryId: entitlementId // The catalog entry ID
        },
        requesterFieldValues: fieldValues.map(field => ({
          id: field.id,
          value: field.value
        }))
      };

      console.log(`📤 Submitting with ${authMethod}:`, JSON.stringify(requestPayload, null, 2));

      const submitResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestPayload)
      });

      console.log('📤 Submit response status:', submitResponse.status);

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error('❌ Submit error response:', errorText);
        console.error('❌ Request URL was:', `https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`);
        console.error('❌ Request payload was:', JSON.stringify(requestPayload, null, 2));
        console.error('❌ Request headers:', JSON.stringify({
          'Authorization': headers.Authorization ? '[REDACTED]' : 'NOT SET',
          'X-Okta-User': headers['X-Okta-User'] || 'NOT SET',
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }, null, 2));
        
        // Try to parse error details
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          console.error('❌ Parsed error details:', JSON.stringify(errorJson, null, 2));
          if (errorJson.errorSummary) {
            errorDetails = errorJson.errorSummary;
          }
          if (errorJson.errorCauses && errorJson.errorCauses.length > 0) {
            console.error('❌ Error causes:', errorJson.errorCauses);
          }
        } catch (e) {
          console.error('❌ Could not parse error response as JSON - response may be HTML or empty');
        }
        
        // If user session token failed, try management API with user impersonation
        if (submitResponse.status === 400 && tokens.accessToken && this.oktaApiToken) {
          console.log('🔄 User session failed, trying Management API with user impersonation...');
          
          const mgmtHeaders = {
            'Authorization': `SSWS ${this.oktaApiToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Okta-User': user.id
          };
          
          const mgmtResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`, {
            method: 'POST',
            headers: mgmtHeaders,
            body: JSON.stringify({
              requestedFor: {
                externalId: user.id // The user who needs access
              },
              requestedBy: {
                externalId: user.sub || user.id // The OIDC sub claim or user ID who is submitting
              },
              requested: {
                entryId: entitlementId // The catalog entry ID
              },
              requesterFieldValues: fieldValues.map(field => ({
                id: field.id,
                value: field.value
              }))
            })
          });
          
          if (mgmtResponse.ok) {
            console.log('✅ Management API with user impersonation worked!');
            const mgmtData = await mgmtResponse.json();
            return {
              success: true,
              data: {
                response: `**✅ Access Request Submitted Successfully**\n\n📱 **Application:** ${appName}\n🎯 **Entitlement:** ${entitlementName}\n🆔 **Request ID:** ${mgmtData.id || 'Generated'}\n\n**Status:** Your request has been submitted for approval.\n\n**Next Steps:**\n• You will receive notifications about request status\n• Check back later for approval updates\n• Contact your administrator if you have questions\n\n*Request submitted successfully through Okta Governance API with user attribution*`
              }
            };
          } else {
            const mgmtErrorText = await mgmtResponse.text();
            console.error('❌ Management API also failed:', mgmtErrorText);
          }
        }
        
        // Try alternative payload format if 400 error
        if (submitResponse.status === 400) {
          console.log('🔄 Trying with justification field...');
          
          const alternativePayload = {
            requestedFor: {
              externalId: user.id // The user who needs access
            },
            requestedBy: {
              externalId: user.sub || user.id // The OIDC sub claim or user ID who is submitting
            },
            requested: {
              entryId: entitlementId // The catalog entry ID
            },
            justification: "Access needed for business requirements",
            requesterFieldValues: fieldValues.map(field => ({
              id: field.id,
              value: field.value
            }))
          };
          
          const retryResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${entitlementId}/requests`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(alternativePayload)
          });
          
          if (retryResponse.ok) {
            console.log('✅ Alternative payload format worked!');
            const retryData = await retryResponse.json();
            return {
              success: true,
              data: {
                response: `**✅ Access Request Submitted Successfully**\n\n📱 **Application:** ${appName}\n🎯 **Entitlement:** ${entitlementName}\n🆔 **Request ID:** ${retryData.id || 'Generated'}\n\n**Status:** Your request has been submitted for approval.\n\n**Next Steps:**\n• You will receive notifications about request status\n• Check back later for approval updates\n• Contact your administrator if you have questions\n\n*Request submitted successfully through Okta Governance API*`
              }
            };
          }
        }
        
        throw new Error(`Submit API error ${submitResponse.status}: ${errorText}`);
      }

      const submitData = await submitResponse.json();
      console.log('✅ Submit success data:', submitData);

      return {
        success: true,
        data: {
          response: `**✅ Access Request Submitted Successfully**\n\n📱 **Application:** ${appName}\n🎯 **Entitlement:** ${entitlementName}\n🆔 **Request ID:** ${submitData.id || 'Generated'}\n\n**Status:** Your request has been submitted for approval.\n\n**Next Steps:**\n• You will receive notifications about request status\n• Check back later for approval updates\n• Contact your administrator if you have questions\n\n*Request submitted successfully through Okta Governance API*`
        }
      };

    } catch (error) {
      console.error('❌ Error submitting access request:', error);
      return {
        success: false,
        data: {
          response: `**❌ Submission Error**\n\nUnable to submit request:\n\`${error}\`\n\nPlease try again or contact your administrator.`
        }
      };
    }
  }
}
import type { User } from '@shared/schema';
import { LocalOllamaService } from './local-ollama';
import { gamificationService } from './simple-gamification.js';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
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
      
      // Record daily visit for gamification (background task)
      gamificationService.recordDailyVisit(user.oktaId).catch(err => 
        console.warn('⚠️ Daily visit recording failed:', err)
      );
      
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
          // Check for admin OAuth tokens first, then fall back to admin session
          const hasAdminOAuth = this.oktaAuthService?.hasAdminOAuthTokens(user.oktaId);
          const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
          
          if (!hasAdminOAuth && !hasAdminSession) {
            console.log('🔐 No admin OAuth or session - requiring admin OAuth');
            return this.requireAdminOAuth('group_management', user);
          }
          
          console.log('✅ Admin authentication found - processing group management request');
          // Use admin OAuth tokens if available, otherwise use management API token
          const adminTokens = hasAdminOAuth ? this.oktaAuthService.getAdminOAuthTokens(user.oktaId) : null;
          return await this.handleGroupManagement(user, tokens, adminTokens);
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

    // Enhanced pattern: Direct access requests with duration (e.g., "need adobe express 1 hour access")
    const directAccessPattern = /(?:need|want|request)\s+(.+?)\s+(?:for\s+)?(\d+)\s+(hour|day|week|month)s?\s+access/i;
    const directAccessMatch = message.match(directAccessPattern);
    if (directAccessMatch) {
      const appName = directAccessMatch[1].trim();
      const duration = directAccessMatch[2];
      const timeUnit = directAccessMatch[3];
      console.log('🚀 SMART REQUEST: Direct access request detected:', { appName, duration, timeUnit });
      return await this.handleIntelligentAccessRequest(appName, duration, timeUnit, user, tokens);
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
    
    // Enhanced pattern: Access revocation requests (e.g., "revoke access to Salesforce.com")
    const revokeAccessPattern = /(?:revoke|remove|disable)\s+access\s+(?:to|from)\s+(.+?)(?:\s|$)/i;
    const revokeAccessMatch = message.match(revokeAccessPattern);
    if (revokeAccessMatch) {
      const appName = revokeAccessMatch[1].trim();
      console.log('🚫 REVOKE REQUEST: Access revocation detected for:', appName);
      return await this.handleAccessRevocation(appName, user, tokens);
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
      data: {
        response: `**🔐 Admin Session Required**\n\nTo perform ${intent.replace('_', ' ')} operations, you need an active admin session.\n\n**Your Current Access:**\n• Role: ${userRole}\n• Can perform: 30-day access reviews, access requests\n\n**To unlock admin capabilities:**\n1. Click "Start Admin Session" below\n2. Authenticate in the admin portal\n3. Return here to continue\n\nThis ensures all admin actions are properly audited in Okta system logs.`,
        requiresAdminAuth: true,
        action: 'admin_oauth_flow',
        adminUrl: `https://${adminDomain}/admin/dashboard`,
        intent: intent
      }
    };
  }

  private requireAdminOAuth(intent: string, user: User): any {
    // Get actual user roles for proper display
    const userRole = this.getUserDisplayRole(user);
    
    return {
      success: true,
      data: {
        response: `**🔐 Admin OAuth Authentication Required**\n\nTo perform ${intent.replace('_', ' ')} operations, you need to authenticate with Okta's dedicated admin app.\n\n**Your Current Access:**\n• Role: ${userRole}\n• Can perform: 30-day access reviews, access requests\n\n**To unlock admin capabilities:**\n1. Click "Authenticate with Admin OAuth" below\n2. Complete the OAuth flow with admin permissions\n3. Return here to continue\n\n**Admin OAuth provides:**\n• okta.governance.read/manage\n• okta.groups.read/manage\n• okta.users.read/manage\n\nThis ensures proper token-based authentication for admin operations.`,
        action: 'admin_oauth_required',
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
        data: {
          response: `**🔐 Admin Authentication Required**\n\n**Your Role:** ${userRole}\n\n**Starting admin session...**\n\nI'm opening the admin authentication flow. Please:\n\n1. Complete the step-up authentication\n2. Grant admin permissions\n3. Return here when authentication is complete\n\n*This creates a secure admin session with proper audit logging.*`,
          requiresAdminAuth: true,
          action: 'admin_oauth_flow'
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

  private async handleGroupManagement(user: User, tokens: OktaTokens, adminTokens?: OktaTokens | null): Promise<any> {
    console.log('👥 Processing group management request');
    
    try {
      // Prioritize admin OAuth tokens, then management API token, then user session token
      let authHeader: string;
      let authSource: string;
      
      if (adminTokens?.accessToken) {
        authHeader = `Bearer ${adminTokens.accessToken}`;
        authSource = 'Admin OAuth Token';
        console.log('🔐 Using admin OAuth token for group operations');
      } else if (this.oktaApiToken) {
        authHeader = `SSWS ${this.oktaApiToken}`;
        authSource = 'Management API Token';
        console.log('🔐 Using management API token for group operations');
      } else {
        authHeader = `Bearer ${tokens.accessToken}`;
        authSource = 'User Session Token';
        console.log('🔐 Using user session token for group operations');
      }
        
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
      console.log(`✅ Groups fetched: ${groups.length} (using ${authSource})`);

      if (groups && groups.length > 0) {
        const groupList = groups.slice(0, 10).map((group: any, index: number) => 
          `${index + 1}. **${group.profile?.name || 'Unnamed Group'}**\n   Type: ${group.type || 'USER_GROUP'}\n   Members: ${group.profile?.membershipCount || 'Unknown'}`
        ).join('\n\n');

        const authStatus = adminTokens ? 'Admin OAuth authenticated' : 'Management API access';

        return {
          success: true,
          data: {
            response: `**👥 Your Manageable Groups**\n\n✅ **Found ${groups.length} groups:**\n\n${groupList}${groups.length > 10 ? `\n\n... and ${groups.length - 10} more groups` : ''}\n\n**Available Actions:**\n• "List users in [group name]" - Show group members\n• "Add user to [group name]" - Add user to group\n• "Remove user from [group name]" - Remove user from group\n\n*${authStatus} - all operations audited*`
          }
        };
      } else {
        return {
          success: true,
          data: {
            response: `**👥 Groups You Can Manage**\n\n⚠️ No groups found under your management.\n\nThis could mean:\n• No groups are assigned to your custom role\n• Group permissions may need configuration\n• Check with your Okta administrator\n\n*Authentication: ${authSource}*`
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
    console.log('📋 Processing catalog request for user:', user.name);
    
    // Use session token with comprehensive governance scopes
    console.log('🔑 Using session token with comprehensive governance scopes');
    
    return await this.handleCatalogWithSessionToken(user, tokens);
  }

  private async handleCatalogWithSessionToken(user: User, tokens: OktaTokens): Promise<any> {
    console.log('📋 Processing catalog request with session token for user:', user.name);
    
    try {
      const authHeader = `Bearer ${tokens.accessToken}`;
      console.log('🔑 Using SESSION TOKEN with comprehensive governance scopes');
      console.log('📋 Fetching catalog from:', `https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=20`);
      
      // Use the correct IGA catalog endpoint with session token (end-user API)
      const response = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`⚠️ Governance catalog failed (${response.status}): ${errorText}`);
        console.log('🔍 Error details for user session token on governance catalog:', {
          url: `https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=20`,
          status: response.status,
          authHeader: authHeader.substring(0, 20) + '...',
          errorPreview: errorText.substring(0, 200)
        });
        
        // Try alternative Apps API endpoint as fallback (still using user session token)
        console.log('🔄 Trying Apps API as fallback with user token...');
        const igaResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps?filter=status eq "ACTIVE"&limit=20`, {
          headers: {
            'Authorization': authHeader, // Still user session token
            'Accept': 'application/json'
          }
        });
        
        if (igaResponse.ok) {
          const igaCatalog = await igaResponse.json();
          console.log('✅ Legacy IGA catalog successful with user token:', igaCatalog.length);
          
          if (igaCatalog && igaCatalog.length > 0) {
            const catalogList = igaCatalog.slice(0, 15).map((entry: any, index: number) => 
              `${index + 1}. **${entry.displayName || entry.name || 'Unknown App'}**\n   ${entry.requestable === false ? '🔒 Not Requestable' : '✅ Available for Request'}\n   Type: ${entry.type || 'Application'}`
            ).join('\n\n');

            return {
              success: true,
              data: {
                response: `**🏪 IGA Application Catalog (User Session)**\n\n✅ **Found ${igaCatalog.length} applications:**\n\n${catalogList}${igaCatalog.length > 15 ? `\n\n... and ${igaCatalog.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Say "request access to [app name]" to submit a request\n• All applications above are from your Okta IGA catalog\n• Requests will be submitted as your user account\n\n*Retrieved using your session token for proper user context*`
              }
            };
          }
        } else {
          const igaErrorText = await igaResponse.text();
          console.log(`⚠️ IGA catalog also failed (${igaResponse.status}): ${igaErrorText}`);
          console.log('🔍 IGA Error details for user session token:', {
            url: `https://${this.oktaDomain}/api/v1/apps?filter=status eq "ACTIVE"&limit=20`,
            status: igaResponse.status,
            errorPreview: igaErrorText.substring(0, 200)
          });
        }
        
        console.log('⚠️ Both governance catalog endpoints failed with user session token');
        console.log('ℹ️ This likely means the user does not have governance permissions or the catalog is empty');
        
        // Instead of falling back to Apps API, inform user about governance permissions
        return {
          success: true,
          data: {
            response: `**🔒 Governance Catalog Access Required**\n\n⚠️ **Access Issue:** Unable to access the governance catalog with your current session.\n\n**This could mean:**\n• Your user account doesn't have governance permissions\n• The governance catalog is empty or not configured\n• Your session token doesn't include the required scopes\n\n**Solutions:**\n• Contact your Okta administrator to:\n  - Grant you governance catalog permissions\n  - Configure applications in the governance catalog\n  - Verify your user roles include governance access\n\n**Alternative:** Try starting an admin session if you have admin privileges.\n\n*Using governance catalog requires proper user permissions and scopes*`
          }
        };
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
    // Use the most specific custom role or format the primary role
    const roleDisplay = user.allRoles && user.allRoles.length > 0 
      ? user.allRoles.find(role => 
          !['Super Admin', 'App Admin', 'Group Admin', 'User Admin', 'super_admin', 'app_owner', 'group_admin'].includes(role)
        ) || user.allRoles[0]
      : this.formatRoleName(user.role);

    // Comprehensive governance capabilities with session token
    const governanceCapabilities = [
      '🏪 **Governance Catalog**: View available applications and entitlements',
      '📋 **Access Requests**: Submit requests for application access with duration',
      '🚀 **Smart Access Requests**: Use natural language like "need adobe express 1 hour access"',
      '📊 **30-Day Access Reviews**: Analyze your application usage patterns',
      '🔍 **Access History**: Review your recent access activities',
      '⏰ **Duration Management**: Request access for specific time periods (hours/days/weeks)',
      '📈 **Usage Analytics**: Track which applications you use most frequently'
    ];

    // Additional capabilities based on role
    const roleBasedCapabilities = [];
    const hasAdminSession = this.oktaAuthService?.getAdminSessionToken(user.oktaId);
    
    if (hasAdminSession) {
      roleBasedCapabilities.push('🔐 **Admin Operations**: Enhanced admin session active');
      if (user.role === 'super_admin' || user.allRoles?.includes('Super Admin')) {
        roleBasedCapabilities.push('👤 **User Management**: Full user administration capabilities');
        roleBasedCapabilities.push('🏛️ **Governance Campaigns**: Create and manage governance workflows');
      }
      if (user.role === 'group_admin' || user.allRoles?.some(role => role.toLowerCase().includes('group'))) {
        roleBasedCapabilities.push('👥 **Group Management**: Manage group memberships and access');
      }
    }

    const allCapabilities = [...governanceCapabilities, ...roleBasedCapabilities];

    return {
      success: true,
      data: {
        response: `**🔑 Your Current Access Level**\n\n**User:** ${user.name}\n**Role:** ${roleDisplay}\n**Session Token:** ✅ Active with Comprehensive Governance Scopes\n\n**Available Capabilities:**\n${allCapabilities.join('\n')}\n\n**Example Commands:**\n• "list available applications to request"\n• "need adobe express 2 hour access"\n• "what apps haven't I used in 30 days?"\n• "request access to salesforce"\n\n${!hasAdminSession && (user.role === 'group_admin' || user.allRoles?.some(role => role.toLowerCase().includes('group'))) ? 
          '**Additional Admin Features:**\nFor group management operations, say "start admin session" to unlock additional capabilities.' : 
          '**Single Authentication:**\nNo additional authentication needed - your session token provides full governance access!'
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

  private async handleIntelligentAccessRequest(appName: string, duration: string, timeUnit: string, user: User, tokens: OktaTokens): Promise<any> {
    try {
      console.log('🚀 Processing intelligent access request:', { appName, duration, timeUnit });
      
      // Step 1: Find the application in catalog
      const authHeader = `Bearer ${tokens.accessToken}`;
      const catalogResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=not(parent pr)&limit=50`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!catalogResponse.ok) {
        throw new Error(`Catalog fetch failed: ${catalogResponse.status}`);
      }

      const catalogData = await catalogResponse.json();
      const catalog = catalogData.entries || catalogData;
      
      // Find matching application (case-insensitive partial match)
      const matchingApp = catalog.find((entry: any) => 
        (entry.name || entry.displayName || '').toLowerCase().includes(appName.toLowerCase())
      );

      if (!matchingApp) {
        return {
          success: true,
          data: {
            response: `**❌ Application Not Found**\n\n"${appName}" is not available in the governance catalog.\n\n**Available applications:**\n${catalog.slice(0, 6).map((entry: any, index: number) => `${index + 1}. ${entry.name || entry.displayName}`).join('\n')}\n\n**Try again with:** "need [exact app name] ${duration} ${timeUnit} access"`
          }
        };
      }

      console.log('✅ Found matching application:', matchingApp.name);

      // Step 2: Get entitlements for this app
      const entitlementsResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries?filter=parent.id eq "${matchingApp.id}"&limit=20`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      let entitlements = [];
      if (entitlementsResponse.ok) {
        const entitlementsData = await entitlementsResponse.json();
        entitlements = entitlementsData.entries || entitlementsData || [];
      }

      // Step 3: Auto-select best entitlement or use app directly if no entitlements
      let targetEntitlement = null;
      if (entitlements.length > 0) {
        // Smart selection: prefer "express" or "basic" for short durations, "pro" for longer
        const isShortDuration = (timeUnit === 'hour' && parseInt(duration) <= 8) || (timeUnit === 'day' && parseInt(duration) <= 1);
        const searchTerms = isShortDuration ? ['express', 'basic', 'standard'] : ['pro', 'full', 'premium', 'complete'];
        
        targetEntitlement = entitlements.find((ent: any) => 
          searchTerms.some(term => (ent.name || ent.displayName || '').toLowerCase().includes(term))
        ) || entitlements[0]; // Fallback to first available
      } else {
        targetEntitlement = matchingApp; // Use app directly if no entitlements
      }

      console.log('🎯 Selected entitlement:', targetEntitlement.name);

      // Step 4: Get request fields for this entitlement
      const fieldsResponse = await fetch(`https://${this.oktaDomain}/governance/api/v2/my/catalogs/default/entries/${targetEntitlement.id}/request-fields`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      let requestFields = [];
      if (fieldsResponse.ok) {
        const fieldsData = await fieldsResponse.json();
        requestFields = fieldsData.fields || fieldsData || [];
      }

      // Step 5: Build duration value in Okta format
      const durationValue = this.convertDurationToOktaFormat(duration, timeUnit);
      console.log('⏱️ Duration converted to Okta format:', durationValue);

      // Step 6: Prepare field values with intelligent defaults
      const fieldValues = requestFields.map((field: any) => {
        if (field.fieldType === 'DURATION' || field.name?.toLowerCase().includes('duration')) {
          return {
            fieldId: field.id,
            value: durationValue
          };
        }
        if (field.fieldType === 'TEXT' && field.name?.toLowerCase().includes('justification')) {
          return {
            fieldId: field.id,
            value: `Access requested for ${duration} ${timeUnit}(s) through AI assistant`
          };
        }
        // Default value for required fields
        return field.required ? {
          fieldId: field.id,
          value: field.defaultValue || 'Auto-selected'
        } : null;
      }).filter(Boolean);

      // Step 7: Submit the access request
      const requestPayload = {
        requestedFor: { externalId: user.oktaId },
        requested: { entryId: targetEntitlement.id, type: 'CATALOG_ENTRY' },
        requesterFieldValues: fieldValues
      };

      console.log('📤 Submitting access request:', JSON.stringify(requestPayload, null, 2));

      const submitResponse = await fetch(`https://${this.oktaDomain}/governance/api/v1/requests`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (submitResponse.ok) {
        const requestData = await submitResponse.json();
        // Record gamification for successful access request
        let gamificationResult = { points: 0, badgesEarned: [] };
        try {
          gamificationResult = await gamificationService.recordAccessRequest(user.oktaId, matchingApp.name);
          console.log('🎮 Access request gamification recorded:', gamificationResult);
        } catch (error) {
          console.warn('⚠️ Access request gamification failed:', error);
        }

        let successMessage = `**🚀 Smart Request Submitted Successfully!**\n\n📱 **Application:** ${matchingApp.name}\n🎯 **Entitlement:** ${targetEntitlement.name}\n⏱️ **Duration:** ${duration} ${timeUnit}(s)\n🆔 **Request ID:** ${requestData.id || 'Generated'}\n\n**Status:** Your request has been submitted for approval.\n\n**What happened automatically:**\n✅ Found "${appName}" in catalog\n✅ Selected best entitlement: "${targetEntitlement.name}"\n✅ Set duration to ${duration} ${timeUnit}(s)\n✅ Submitted with proper justification`;

        // Add gamification rewards
        if (gamificationResult.points > 0) {
          successMessage += `\n\n🎮 **Rewards Earned:**\n• +${gamificationResult.points} points for submitting access request`;
          
          if (gamificationResult.badgesEarned.length > 0) {
            successMessage += `\n• New badges: ${gamificationResult.badgesEarned.join(', ')}`;
          }
        }

        successMessage += '\n\n*Request submitted successfully through intelligent workflow*';

        return {
          success: true,
          data: {
            response: successMessage
          }
        };
      } else {
        const errorData = await submitResponse.text();
        console.error('❌ Request submission failed:', errorData);
        return {
          success: true,
          data: {
            response: `**❌ Request Submission Failed**\n\nFound the application "${matchingApp.name}" but couldn't submit the request.\n\n**Error:** ${submitResponse.status} - ${submitResponse.statusText}\n\n**Try the manual process:**\n1. Say "request access to ${appName}"\n2. Follow the step-by-step flow\n\n*The intelligent workflow encountered an issue during submission*`
          }
        };
      }

    } catch (error) {
      console.error('❌ Intelligent access request failed:', error);
      return {
        success: true,
        data: {
          response: `**❌ Smart Request Failed**\n\nI couldn't process "${appName}" for ${duration} ${timeUnit} access automatically.\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n**Try the standard flow:**\n• Say "list available applications"\n• Then "request access to [exact app name]"\n\n*Falling back to manual request process*`
        }
      };
    }
  }

  private convertDurationToOktaFormat(duration: string, timeUnit: string): string {
    const durationNum = parseInt(duration);
    
    switch (timeUnit.toLowerCase()) {
      case 'hour':
        return `PT${durationNum}H`;
      case 'day':
        return `P${durationNum}D`;
      case 'week':
        return `P${durationNum}W`;
      case 'month':
        return `P${durationNum}M`;
      default:
        return `PT${durationNum}H`; // Default to hours
    }
  }

  private async handleAccessRevocation(appName: string, user: User, tokens: OktaTokens): Promise<any> {
    try {
      console.log('🚫 Processing access revocation request for:', appName);
      
      // Step 1: Get user's current app assignments using session token
      const authHeader = `Bearer ${tokens.accessToken}`;
      const userAppsResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/me/appLinks`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!userAppsResponse.ok) {
        throw new Error(`Failed to fetch user apps: ${userAppsResponse.status}`);
      }

      const userApps = await userAppsResponse.json();
      console.log(`📱 Found ${userApps.length} assigned applications for user`);

      // Step 2: Find matching application (case-insensitive partial match)
      const matchingApp = userApps.find((app: any) => 
        (app.label || app.linkText || '').toLowerCase().includes(appName.toLowerCase())
      );

      if (!matchingApp) {
        // List available apps for revocation
        const appList = userApps.slice(0, 10).map((app: any, index: number) => 
          `${index + 1}. ${app.label || app.linkText}`
        ).join('\n');

        return {
          success: true,
          data: {
            response: `**❌ Application Not Found**\n\n"${appName}" is not currently assigned to your account.\n\n**Your current applications:**\n${appList}\n\n**Try again with:** "revoke access to [exact app name]"`
          }
        };
      }

      console.log('✅ Found matching application for revocation:', matchingApp.label);

      // Step 3: Use Admin API to find the actual application and check assignment method
      console.log('🔍 Step 3: Using Admin API to find application details and assignment method...');
      
      // Find the application in the admin API
      const appSearchResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps?q=${encodeURIComponent(matchingApp.label)}&limit=10`, {
        headers: {
          'Authorization': `SSWS ${this.oktaApiToken}`,
          'Accept': 'application/json'
        }
      });

      if (!appSearchResponse.ok) {
        throw new Error(`Failed to search applications: ${appSearchResponse.status}`);
      }

      const foundApps = await appSearchResponse.json();
      const targetApp = foundApps.find((app: any) => 
        app.label?.toLowerCase() === matchingApp.label?.toLowerCase() ||
        app.name?.toLowerCase() === matchingApp.label?.toLowerCase()
      ) || foundApps[0]; // Fallback to first match

      if (!targetApp) {
        throw new Error('Application not found in admin API');
      }

      console.log('🎯 Found target application in admin API:', targetApp.label, 'ID:', targetApp.id);

      // Step 4: Check how the user is assigned to this app (direct vs group)
      console.log('🔍 Step 4: Checking assignment method (direct vs group)...');
      
      // Get direct user assignments for this app
      const directAssignmentsResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps/${targetApp.id}/users/${user.oktaId}`, {
        headers: {
          'Authorization': `SSWS ${this.oktaApiToken}`,
          'Accept': 'application/json'
        }
      });

      let isDirectlyAssigned = directAssignmentsResponse.ok;
      console.log('👤 Direct assignment check:', isDirectlyAssigned ? 'ASSIGNED' : 'NOT ASSIGNED');

      // Get group assignments for this app
      const groupAssignmentsResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps/${targetApp.id}/groups?limit=100`, {
        headers: {
          'Authorization': `SSWS ${this.oktaApiToken}`,
          'Accept': 'application/json'
        }
      });

      let assignedGroups: any[] = [];
      let userGroupsWithAccess: any[] = [];

      if (groupAssignmentsResponse.ok) {
        const appGroups = await groupAssignmentsResponse.json();
        console.log('👥 Found', appGroups.length, 'groups assigned to application');

        // Get user's groups
        const userGroupsResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/${user.oktaId}/groups`, {
          headers: {
            'Authorization': `SSWS ${this.oktaApiToken}`,
            'Accept': 'application/json'
          }
        });

        if (userGroupsResponse.ok) {
          const userGroups = await userGroupsResponse.json();
          
          // Find which groups provide access to this app
          userGroupsWithAccess = userGroups.filter((userGroup: any) =>
            appGroups.some((appGroup: any) => appGroup.id === userGroup.id)
          );

          assignedGroups = userGroupsWithAccess;
          console.log('🎯 User has access through', userGroupsWithAccess.length, 'groups:', 
            userGroupsWithAccess.map((g: any) => g.profile?.name || g.name).join(', '));
        }
      }

      // Step 5: Perform the appropriate revocation
      const revocationResults: string[] = [];
      let successCount = 0;
      let errorCount = 0;

      // Remove direct assignment if exists
      if (isDirectlyAssigned) {
        console.log('🚫 Removing direct user assignment...');
        try {
          const removeDirectResponse = await fetch(`https://${this.oktaDomain}/api/v1/apps/${targetApp.id}/users/${user.oktaId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `SSWS ${this.oktaApiToken}`,
              'Accept': 'application/json'
            }
          });

          if (removeDirectResponse.ok) {
            revocationResults.push('✅ Removed direct user assignment');
            successCount++;
            console.log('✅ Direct assignment removed successfully');
          } else {
            revocationResults.push(`❌ Failed to remove direct assignment: ${removeDirectResponse.status}`);
            errorCount++;
            console.error('❌ Direct assignment removal failed:', removeDirectResponse.status);
          }
        } catch (error) {
          revocationResults.push(`❌ Error removing direct assignment: ${error}`);
          errorCount++;
          console.error('❌ Direct assignment removal error:', error);
        }
      }

      // Remove from groups if assigned via groups
      for (const group of userGroupsWithAccess) {
        console.log(`🚫 Removing user from group: ${group.profile?.name || group.name} (${group.id})`);
        try {
          const removeGroupResponse = await fetch(`https://${this.oktaDomain}/api/v1/groups/${group.id}/users/${user.oktaId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `SSWS ${this.oktaApiToken}`,
              'Accept': 'application/json'
            }
          });

          if (removeGroupResponse.ok) {
            revocationResults.push(`✅ Removed from group: ${group.profile?.name || group.name}`);
            successCount++;
            console.log(`✅ Removed from group: ${group.profile?.name || group.name}`);
          } else {
            revocationResults.push(`❌ Failed to remove from group ${group.profile?.name || group.name}: ${removeGroupResponse.status}`);
            errorCount++;
            console.error(`❌ Group removal failed for ${group.profile?.name || group.name}:`, removeGroupResponse.status);
          }
        } catch (error) {
          revocationResults.push(`❌ Error removing from group ${group.profile?.name || group.name}: ${error}`);
          errorCount++;
          console.error(`❌ Group removal error for ${group.profile?.name || group.name}:`, error);
        }
      }

      // Step 6: Record gamification and return comprehensive results
      let gamificationResult = { points: 0, licenseSeatsSaved: 0, badgesEarned: [] };
      
      if (successCount > 0) {
        // Record successful access revocation for gamification
        try {
          gamificationResult = await gamificationService.recordAccessRevocation(user.oktaId, targetApp.label);
          console.log('🎮 Gamification recorded:', gamificationResult);
        } catch (error) {
          console.warn('⚠️ Gamification recording failed:', error);
        }
      }

      if (!isDirectlyAssigned && userGroupsWithAccess.length === 0) {
        return {
          success: true,
          data: {
            response: `**🔍 Access Analysis for ${targetApp.label}**\n\n**Status:** No revocable assignments found\n\n**Analysis Results:**\n• No direct user assignment found\n• User not assigned through any groups\n• Access may be inherited through other means\n\n**Possible reasons:**\n• App might be publicly available\n• Access through different assignment method\n• App assignment cached in user session\n\n**Recommendation:** Contact your administrator to investigate the access path for this application.`
          }
        };
      }

      const totalOperations = (isDirectlyAssigned ? 1 : 0) + userGroupsWithAccess.length;
      
      // Create success message with gamification
      let successMessage = `**🚫 Access Revocation Complete for ${targetApp.label}**\n\n**Revocation Summary:**\n• Operations performed: ${totalOperations}\n• Successful: ${successCount}\n• Failed: ${errorCount}\n\n**Details:**\n${revocationResults.join('\n')}\n\n**Assignment Analysis:**\n• Direct assignment: ${isDirectlyAssigned ? 'Was assigned (now removed)' : 'Not assigned'}\n• Group assignments: ${userGroupsWithAccess.length > 0 ? `${userGroupsWithAccess.length} group(s) (processed)` : 'None found'}`;

      if (successCount > 0) {
        successMessage += `\n\n🎉 **Great Work! We saved ${gamificationResult.licenseSeatsSaved} license seat${gamificationResult.licenseSeatsSaved > 1 ? 's' : ''} for our company!**\n\n**🎮 Rewards Earned:**\n• +${gamificationResult.points} points\n• License seats saved: ${gamificationResult.licenseSeatsSaved}`;
        
        if (gamificationResult.badgesEarned.length > 0) {
          successMessage += `\n• New badges: ${gamificationResult.badgesEarned.join(', ')}`;
        }
        
        successMessage += `\n\n**Status:** Access has been revoked. Changes will take effect within a few minutes.`;
      } else {
        successMessage += `\n\n**Status:** Unable to revoke access - please contact your administrator.`;
      }

      successMessage += '\n\n*Revocation performed using Admin API with proper audit trail*';
      
      return {
        success: true,
        data: {
          response: successMessage
        }
      };

    } catch (error) {
      console.error('❌ Access revocation failed:', error);
      return {
        success: true,
        data: {
          response: `**❌ Access Revocation Error**\n\nFailed to process revocation for "${appName}".\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n**Alternative approaches:**\n• Contact your Okta administrator directly\n• Use the Okta Admin Console manually\n• Check if you have sufficient admin privileges\n\n*Error occurred during API-based revocation*`
        }
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

      // ALWAYS use user session token for access requests (never management API)
      // This ensures proper user context and scoping as mentioned by user
      if (!tokens.accessToken) {
        throw new Error('User session token required for access requests. Please refresh your session.');
      }
      
      const authHeader = `Bearer ${tokens.accessToken}`;
      const authMethod = 'User session token (user scoped)';
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authHeader
      };
      
      console.log('🔒 Using USER SESSION TOKEN ONLY for access request (proper user scoping)');

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
        
        // DO NOT fallback to management API - this causes requests to appear as "okta admin"
        // User session token is required for proper user attribution as per user feedback
        console.log('❌ User session token failed - NO FALLBACK to management API (would show as okta admin)');
        
        // Try alternative payload format if 400 error (still using user session token only)
        if (submitResponse.status === 400) {
          console.log('🔄 Trying with justification field using user session token...');
          
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
            headers: headers, // Still using user session token headers
            body: JSON.stringify(alternativePayload)
          });
          
          if (retryResponse.ok) {
            console.log('✅ Alternative payload format worked with user session token!');
            const retryData = await retryResponse.json();
            return {
              success: true,
              data: {
                response: `**✅ Access Request Submitted Successfully**\n\n📱 **Application:** ${appName}\n🎯 **Entitlement:** ${entitlementName}\n🆔 **Request ID:** ${retryData.id || 'Generated'}\n\n**Status:** Your request has been submitted for approval.\n\n**Next Steps:**\n• You will receive notifications about request status\n• Check back later for approval updates\n• Contact your administrator if you have questions\n\n*Request submitted successfully using your session token*`
              }
            };
          } else {
            const retryErrorText = await retryResponse.text();
            console.error('❌ Alternative format also failed with user session token:', retryErrorText);
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
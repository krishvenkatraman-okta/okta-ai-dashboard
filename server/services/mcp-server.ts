import type { User, McpResponse } from '@shared/schema';
import { LLMAutomationService } from './llm-automation';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export class McpServerService {
  private readonly oktaDomain: string;
  private readonly oktaApiToken: string;
  private readonly pamDomain: string;
  private readonly pamTeamName: string;
  private readonly llmAutomation: LLMAutomationService;

  constructor() {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.oktaApiToken = process.env.OKTA_API_TOKEN || '';
    this.pamDomain = process.env.OKTA_PAM_DOMAIN || `${this.oktaDomain}`;
    this.pamTeamName = process.env.OKTA_PAM_TEAM || '';
    this.llmAutomation = new LLMAutomationService();

    if (!this.oktaApiToken) {
      console.warn('Okta API token not configured. Set OKTA_API_TOKEN environment variable for MCP server operations.');
    }
    if (!this.pamTeamName) {
      console.warn('Okta PAM team not configured. Set OKTA_PAM_TEAM environment variable for PAM operations.');
    }
  }

  async processMessage(message: string, user: User, tokens: OktaTokens): Promise<McpResponse> {
    try {
      const intent = this.analyzeIntent(message);
      
      switch (intent.type) {
        case 'governance':
        case 'access_request':
        case 'list_governance':
        case 'list_catalog':
          // Use LLM automation for all governance and access request operations
          const result = await this.llmAutomation.processGovernanceRequest(message, user, tokens);
          return {
            success: result.success,
            data: result.data,
            error: result.error
          };
        case 'pam':
          return await this.handlePamRequest(intent, user, tokens);
        case 'user_management':
          return await this.handleUserManagement(intent, user, tokens);
        default:
          return await this.handleGeneralQuery(message, user);
      }
    } catch (error) {
      console.error('MCP processing error:', error);
      return {
        success: false,
        error: 'Sorry, I encountered an error processing your request. Please try again.'
      };
    }
  }

  private analyzeIntent(message: string): { type: string; action?: string; params?: any } {
    const lowerMessage = message.toLowerCase();

    // Governance patterns
    if (lowerMessage.includes('governance') && lowerMessage.includes('applications')) {
      return { type: 'list_governance' };
    }
    
    if (lowerMessage.includes('governance') || lowerMessage.includes('campaign') || lowerMessage.includes('access review')) {
      return { type: 'governance', action: 'start' };
    }

    // Catalog and access request patterns
    if (lowerMessage.includes('catalog') || lowerMessage.includes('available') && lowerMessage.includes('resource')) {
      return { type: 'list_catalog' };
    }

    if (lowerMessage.includes('access request') || lowerMessage.includes('request access') || lowerMessage.includes('submit') && lowerMessage.includes('request')) {
      return { type: 'access_request', action: 'submit' };
    }

    // PAM patterns
    if (lowerMessage.includes('pam') || lowerMessage.includes('session') || lowerMessage.includes('privileged')) {
      if (lowerMessage.includes('list') || lowerMessage.includes('show')) {
        return { type: 'pam', action: 'list' };
      }
      if (lowerMessage.includes('terminate') || lowerMessage.includes('end')) {
        return { type: 'pam', action: 'terminate' };
      }
      if (lowerMessage.includes('enroll') || lowerMessage.includes('start')) {
        return { type: 'pam', action: 'enroll' };
      }
      return { type: 'pam', action: 'list' };
    }

    // User management patterns
    if (lowerMessage.includes('user') && (lowerMessage.includes('manage') || lowerMessage.includes('reset') || lowerMessage.includes('unlock'))) {
      return { type: 'access_request', action: 'submit' };
    }

    if (lowerMessage.includes('user') || lowerMessage.includes('group')) {
      return { type: 'user_management' };
    }

    return { type: 'general' };
  }

  private async handleGovernanceRequest(intent: any, user: User, tokens: OktaTokens): Promise<McpResponse> {
    if (user.role !== 'super_admin' && user.role !== 'app_owner') {
      return {
        success: false,
        error: 'You do not have permission to start governance campaigns. This feature is available to Super Administrators and App Owners only.'
      };
    }

    // Simulate governance campaign capabilities based on role
    if (user.role === 'super_admin') {
      return {
        success: true,
        toolName: 'start_governance_campaign',
        data: {
          response: `I can help you start a governance campaign! As a Super Administrator, you can create campaigns for:\n\n• All applications in the organization\n• User access reviews across all apps\n• Group membership audits\n• Privileged access reviews\n\nWould you like me to:\n1. Show applications that need governance review\n2. Create a new campaign for all applications\n3. Review existing campaigns\n\nPlease let me know your preference.`
        }
      };
    } else {
      return {
        success: true,
        toolName: 'start_app_owner_campaign',
        data: {
          response: `As an App Owner, I can help you start governance campaigns for your applications:\n\n• Review user access to your apps\n• Audit permissions and entitlements\n• Generate compliance reports\n\nBased on your role, you can manage campaigns for applications you own. Would you like me to show you the applications you can review?`
        }
      };
    }
  }

  private async handlePamRequest(intent: any, user: User, tokens: OktaTokens): Promise<McpResponse> {
    const { action } = intent;

    switch (action) {
      case 'list':
        return {
          success: true,
          toolName: 'list_pam_sessions',
          data: {
            response: `Here are your current PAM sessions:\n\n🟢 **Active Sessions:**\n• Production Database Server\n  - Started: 2 hours 15 minutes ago\n  - Resource: db-prod-01.company.com\n  - Protocol: SSH\n\n• AWS Admin Console\n  - Started: 45 minutes ago\n  - Resource: aws-admin.company.com\n  - Protocol: HTTPS\n\n📋 **Available Actions:**\n• Terminate a session\n• Enroll in a new session\n• View session history\n\nWhat would you like to do?`
          }
        };

      case 'enroll':
        return {
          success: true,
          toolName: 'enroll_pam_session',
          data: {
            response: `I can help you enroll in a new PAM session for team "${this.pamTeamName}".\n\nAvailable resources for your role:\n\n🖥️ **Servers:**\n• Production Database (db-prod-01)\n• Web Server Cluster (web-prod-*)\n• Application Server (app-prod-01)\n\n☁️ **Cloud Consoles:**\n• AWS Management Console\n• Azure Portal\n• Google Cloud Console\n\n🔧 **Admin Tools:**\n• Okta Admin Console\n• Network Management Interface\n\nPAM Domain: ${this.pamDomain}\nTeam: ${this.pamTeamName}\n\nWhich resource would you like to access?`
          }
        };

      case 'terminate':
        return {
          success: true,
          toolName: 'terminate_pam_session',
          data: {
            response: `I can help you terminate PAM sessions. Current active sessions:\n\n1. Production Database Server (2h 15m)\n2. AWS Admin Console (45m)\n\nWhich session would you like to terminate? Please specify the number or resource name.`
          }
        };

      default:
        return {
          success: true,
          data: {
            response: `I can help you with PAM (Privileged Access Management) operations:\n\n• **List** current sessions\n• **Enroll** in new privileged sessions\n• **Terminate** active sessions\n• **View** session history\n\nWhat would you like to do?`
          }
        };
    }
  }

  private async handleAccessRequest(intent: any, user: User, tokens: OktaTokens): Promise<McpResponse> {
    if (user.role === 'super_admin' || user.role === 'app_owner') {
      return {
        success: true,
        toolName: 'review_access_requests',
        data: {
          response: `You have **12 pending access requests** to review:\n\n📋 **By Application:**\n• Salesforce (5 requests)\n  - 3 for Sales role access\n  - 2 for Marketing role access\n\n• AWS Console (3 requests)\n  - 2 for Developer access\n  - 1 for Admin access\n\n• Internal Applications (4 requests)\n  - 2 for JIRA access\n  - 1 for Confluence access\n  - 1 for Tableau access\n\n**Quick Actions:**\n• Review all Salesforce requests\n• Approve developer AWS requests\n• View request details\n\nWould you like to review any specific requests?`
        }
      };
    } else {
      return {
        success: true,
        toolName: 'submit_access_request',
        data: {
          response: `I can help you submit an access request! Here are the applications you can request access to:\n\n📱 **Business Applications:**\n• Salesforce CRM\n• Microsoft Office 365\n• Slack Workspace\n• Jira Project Management\n\n☁️ **Development Tools:**\n• GitHub Repository Access\n• Jenkins CI/CD\n• Docker Registry\n\n🔧 **Admin Tools:**\n• AWS Console (with justification)\n• Okta Admin (limited scope)\n\nWhich application would you like to request access to?`
        }
      };
    }
  }

  private async handleUserManagement(intent: any, user: User, tokens: OktaTokens): Promise<McpResponse> {
    if (user.role !== 'super_admin') {
      return {
        success: false,
        error: 'User management operations are only available to Super Administrators.'
      };
    }

    return {
      success: true,
      toolName: 'user_management',
      data: {
        response: `As a Super Administrator, I can help you with user management:\n\n👥 **User Operations:**\n• Create new users\n• Deactivate/reactivate users\n• Reset passwords\n• Update user profiles\n\n🏷️ **Group Management:**\n• Add users to groups\n• Remove users from groups\n• Create new groups\n• Manage group rules\n\n🔒 **Access Management:**\n• Assign applications to users\n• Review user permissions\n• Bulk user operations\n\nWhat would you like to do?`
      }
    };
  }

  private async handleGeneralQuery(message: string, user: User): Promise<McpResponse> {
    const roleCapabilities = this.getRoleCapabilities(user.role);
    
    return {
      success: true,
      data: {
        response: `I'm your Okta Assistant! Based on your role as ${this.getRoleDisplay(user.role)}, I can help you with:\n\n${roleCapabilities.join('\n')}\n\nIs there something specific you'd like to do? You can ask me about:\n• Starting governance campaigns\n• Managing PAM sessions\n• Processing access requests\n• User and group management (Super Admins)\n\nHow can I assist you today?`
      }
    };
  }

  private getRoleCapabilities(role: string): string[] {
    switch (role) {
      case 'super_admin':
        return [
          '• User and group management',
          '• Application governance campaigns',
          '• PAM session operations',
          '• Access request reviews',
          '• Security policy management',
          '• Organization-wide reporting'
        ];
      case 'app_owner':
        return [
          '• Manage your applications',
          '• Run governance campaigns for your apps',
          '• Review access requests for your apps',
          '• Application usage reports',
          '• PAM operations for owned resources'
        ];
      default:
        return [
          '• Submit access requests',
          '• View your applications',
          '• Check access status',
          '• Update profile information',
          '• View personal session history'
        ];
    }
  }

  private getRoleDisplay(role: string): string {
    switch (role) {
      case 'super_admin': return 'Super Administrator';
      case 'app_owner': return 'App Owner';
      default: return 'User';
    }
  }
}

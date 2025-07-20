/**
 * Okta Model Context Protocol (MCP) Server
 * Intelligent API mapping and execution based on natural language
 * Enhanced with proper API documentation and workflow sequences
 */

import { OktaApiDocumentationService, OKTA_IGA_WORKFLOWS, API_ENDPOINT_DOCUMENTATION } from './okta-api-documentation.ts';

interface ApiEndpoint {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  description: string;
  requiredParams?: string[];
  optionalParams?: string[];
  bodySchema?: any;
}

interface ApiRequest {
  endpoint: ApiEndpoint;
  params: Record<string, any>;
  body?: any;
}

export class OktaMCPServer {
  private domain: string;
  private apiToken: string;
  private trainingService: any; // Will be imported dynamically
  private currentUserContext: any; // Store current user context for API calls
  
  // Okta API endpoint registry
  private endpoints: ApiEndpoint[] = [
    // IGA Catalog APIs
    {
      name: 'list_catalog_entries',
      method: 'GET',
      endpoint: '/governance/api/v2/my/catalogs/default/entries',
      description: 'Get available applications in IGA catalog for access requests',
      optionalParams: ['filter', 'limit', 'after']
    },
    {
      name: 'get_catalog_entry',
      method: 'GET', 
      endpoint: '/governance/api/v2/my/catalogs/default/entries/{entryId}',
      description: 'Get detailed information about a specific catalog entry',
      requiredParams: ['entryId']
    },
    {
      name: 'submit_access_request',
      method: 'POST',
      endpoint: '/governance/api/v2/my/requests',
      description: 'Submit an access request for an application',
      bodySchema: {
        catalogId: 'string',
        justification: 'string',
        roleId: 'string (optional)',
        duration: 'number (optional)',
        durationUnit: 'string (optional)'
      }
    },
    {
      name: 'list_my_requests',
      method: 'GET',
      endpoint: '/governance/api/v2/my/requests',
      description: 'Get user\'s submitted access requests'
    },
    // System Log API for usage tracking
    {
      name: 'get_system_logs',
      method: 'GET',
      endpoint: '/api/v1/logs',
      description: 'Get system logs for usage tracking and access reviews',
      optionalParams: ['filter', 'since', 'until', 'limit']
    },
    // User and App Management
    {
      name: 'list_user_apps',
      method: 'GET',
      endpoint: '/api/v1/apps',
      description: 'List applications assigned to user or available in org'
    },
    {
      name: 'get_user_profile',
      method: 'GET',
      endpoint: '/api/v1/users/{userId}',
      description: 'Get user profile information',
      requiredParams: ['userId']
    },
    // Governance Campaign APIs - Try different endpoint structure
    {
      name: 'list_governance_campaigns',
      method: 'GET',
      endpoint: '/api/v1/governance/campaigns',
      description: 'List existing governance campaigns for access reviews',
      optionalParams: ['limit', 'after', 'status']
    },
    {
      name: 'list_owned_apps',
      method: 'GET', 
      endpoint: '/api/v1/apps',
      description: 'List applications owned or managed by the current user',
      optionalParams: ['filter', 'limit', 'after']
    },
    {
      name: 'list_groups',
      method: 'GET',
      endpoint: '/api/v1/groups',
      description: 'List groups that user can manage',
      optionalParams: ['q', 'filter', 'limit', 'expand']
    },
    {
      name: 'get_group_members',
      method: 'GET',
      endpoint: '/api/v1/groups/{groupId}/users',
      description: 'List members of a specific group',
      requiredParams: ['groupId'],
      optionalParams: ['limit', 'after']
    }
  ];

  constructor() {
    this.domain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.apiToken = process.env.OKTA_API_TOKEN || '';
    this.initializeTraining();
  }

  private async initializeTraining(): Promise<void> {
    try {
      const { LLMTrainingService } = await import('./llm-training-service.ts');
      this.trainingService = new LLMTrainingService();
    } catch (error) {
      console.warn('Training service unavailable:', error.message);
    }
  }

  private process30DayReview(results: any[]): string {
    try {
      console.log('🔍 Processing 30-day review with results:', results.map(r => ({ endpoint: r.endpoint, success: r.success, dataLength: r.data?.length })));
      
      // Find the user apps and system logs results - check both endpoint name and success data
      const userAppsResult = results.find(r => r.endpoint === 'list_user_apps' && r.success);
      const systemLogsResult = results.find(r => r.endpoint === 'get_system_logs' && r.success);

      if (!userAppsResult?.data && !systemLogsResult?.data) {
        console.log('⚠️ No valid data found for 30-day review');
        return `**📊 30-Day Access Review - AI Enhanced**\n\n❌ Unable to retrieve application data. Debug info:\n• User Apps API: ${userAppsResult ? 'Success' : 'Failed'}\n• System Logs API: ${systemLogsResult ? 'Success' : 'Failed'}\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`;
      }

      const userApps = userAppsResult?.data || [];
      const systemLogs = systemLogsResult?.data || [];
      
      // Process system logs to find recent access patterns
      const recentAccess = new Set();
      if (Array.isArray(systemLogs)) {
        systemLogs.forEach((log: any) => {
          if (log.target?.[0]?.id) {
            recentAccess.add(log.target[0].id);
          }
        });
      }

      // Find unused applications
      const unusedApps = [];
      const usedApps = [];
      
      if (Array.isArray(userApps)) {
        userApps.forEach((app: any) => {
          if (recentAccess.has(app.id)) {
            usedApps.push(app);
          } else {
            unusedApps.push(app);
          }
        });
      }

      let responseText = `**📊 30-Day Access Review - AI Enhanced**\n\n`;
      responseText += `✅ Retrieved ${userApps.length} applications and ${systemLogs.length} access events\n\n`;

      if (unusedApps.length > 0) {
        responseText += `**🔍 Applications Not Used (Last 30 Days):**\n`;
        unusedApps.slice(0, 10).forEach((app: any) => {
          responseText += `• ${app.label || app.name || 'Unknown App'}\n`;
        });
        
        if (unusedApps.length > 10) {
          responseText += `• ... and ${unusedApps.length - 10} more applications\n`;
        }
        
        responseText += `\n**Recommendation:** Consider reviewing access to these ${unusedApps.length} unused applications.\n\n`;
      } else {
        responseText += `**✅ All Applications Active**\nAll your applications show recent usage in the last 30 days.\n\n`;
      }

      responseText += `**Usage Summary:**\n`;
      responseText += `• Active Apps: ${usedApps.length}\n`;
      responseText += `• Unused Apps: ${unusedApps.length}\n`;
      responseText += `• Total Access Events: ${systemLogs.length}\n\n`;
      
      responseText += `*📊 AI continuously learns from usage patterns*\n\n`;
      responseText += `**Feedback:** 👍 👎 (Help AI improve accuracy)`;

      return responseText;

    } catch (error) {
      console.error('Error processing 30-day review:', error);
      return `**📊 30-Day Access Review - AI Enhanced**\n\n❌ Error processing review data: ${error.message}\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`;
    }
  }

  /**
   * Analyze natural language intent and map to API calls with continuous learning
   */
  async analyzeIntent(userMessage: string, userContext?: any): Promise<ApiRequest[]> {
    const message = userMessage.toLowerCase();
    const requests: ApiRequest[] = [];

    // First try improved intent detection if training service is available
    if (this.trainingService) {
      const improvedIntent = await this.trainingService.improvedIntentDetection(
        userMessage, 
        userContext?.userRole || 'regular_user'
      );
      
      if (improvedIntent && improvedIntent.confidence > 0.7) {
        console.log(`🤖 MCP: Using learned intent "${improvedIntent.intent}" (${(improvedIntent.confidence * 100).toFixed(1)}% confidence)`);
        console.log(`🧠 Reasoning: ${improvedIntent.reasoning}`);
        
        const endpoint = this.endpoints.find(e => e.name === improvedIntent.intent.replace('fetch_', 'list_'));
        if (endpoint) {
          requests.push({ endpoint, params: {} });
          return requests;
        }
      }
    }

    // Access request intent
    if (message.includes('access request') || message.includes('request access') || 
        message.includes('catalog') || message.includes('available apps')) {
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_catalog_entries')!,
        params: {
          filter: 'status eq "ACTIVE"',
          limit: 50
        }
      });
    }

    // Handle entitlement selection without justification first - show required fields
    const entitlementSelectionMatch = message.match(/I want (.+?)(?:\s+for\s+(.+))?$/i);
    if (entitlementSelectionMatch) {
      const entitlementName = entitlementSelectionMatch[1].trim();
      const justification = entitlementSelectionMatch[2]?.trim();
      
      if (justification) {
        // Full request with justification - submit it
        console.log('🎯 MCP: Entitlement request with justification:', entitlementName);
        requests.push({
          endpoint: this.endpoints.find(e => e.name === 'list_catalog_entries')!,
          params: { filter: 'status eq "ACTIVE"', limit: 200, findEntitlement: entitlementName, justification: justification }
        });
      } else {
        // Just selection - show required fields
        console.log('🎯 MCP: Entitlement selection for fields:', entitlementName);
        requests.push({
          endpoint: this.endpoints.find(e => e.name === 'list_catalog_entries')!,
          params: { filter: 'status eq "ACTIVE"', limit: 200, showFieldsFor: entitlementName }
        });
      }
    }

    // Group management intents for GROUP_MEMBERSHIP_ADMIN - use manageable groups only
    // PRIORITY: Check this BEFORE other intents to avoid conflicts
    if (message.includes('groups i can manage') || message.includes('show my groups') || 
        message.includes('list groups') || message.includes('managed groups') ||
        message.includes('my groups')) {
      console.log('👥 MCP: Group management request detected - will use manageable groups only');
      // Mark this as a special manageable groups request
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_groups')!,
        params: { limit: 50, expand: 'stats', manageableOnly: true }
      });
      // Return early to prevent other intent matches
      return requests;
    }

    // Specific app access request - handle via governance service  
    const accessMatch = message.match(/request access to (.+)/i);
    if (accessMatch) {
      const appName = accessMatch[1].trim();
      console.log('🎯 MCP: Access request detected for:', appName);
      
      // First get catalog to find the app ID
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_catalog_entries')!,
        params: { filter: 'status eq "ACTIVE"', limit: 50, appName: appName }
      });
    }

    // Group member management
    const groupMemberMatch = message.match(/(?:list|show|add|remove) (?:users?|members?) (?:in|from|to) (.+)/i);
    if (groupMemberMatch) {
      const groupName = groupMemberMatch[1].trim();
      console.log('👤 MCP: Group member management for:', groupName);
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_groups')!,
        params: { q: groupName, limit: 10, expand: 'stats', operation: 'list_members' }
      });
    }

    // 30-day access review intent
    if (message.includes('30-day') || message.includes('unused') || 
        (message.includes('review') && message.includes('access'))) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Get both user apps and system logs for comprehensive analysis
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_user_apps')!,
        params: {}
      });
      
      // Simplified System Log API call with basic filter
      console.log('🔍 30-day review: Requesting System Logs with date range:', {
        from: thirtyDaysAgo.toISOString(),
        to: new Date().toISOString()
      });
      
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'get_system_logs')!,
        params: {
          filter: `eventType eq "user.authentication.sso"`,
          since: thirtyDaysAgo.toISOString(),
          until: new Date().toISOString(),
          limit: 1000,
          sortOrder: 'DESCENDING'
        }
      });
    }

    // My requests status
    if (message.includes('my requests') || message.includes('request status')) {
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_my_requests')!,
        params: {}
      });
    }

    // Governance campaign creation - Use GET to list campaigns instead of POST
    if (message.includes('governance campaign') || message.includes('campaign')) {
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_governance_campaigns')!,
        params: {
          limit: 50
        }
      });
    }
    
    // Show my apps - Add intent for owned applications
    if (message.includes('show my apps') || message.includes('my applications') || message.includes('owned apps')) {
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'list_owned_apps')!,
        params: {}
      });
    }

    return requests;
  }

  /**
   * Execute API request with proper authentication and error handling
   */
  async executeRequest(request: ApiRequest, userToken?: string): Promise<any> {
    let url = '';
    try {
      // Special handling for catalog entries - use governance service directly
      if (request.endpoint.name === 'list_catalog_entries') {
        const { OktaGovernanceService } = await import('./okta-governance-api.ts');
        const governanceService = new OktaGovernanceService();
        const catalogData = await governanceService.getCatalogEntries(userToken);
        
        console.log('📊 MCP: Using governance service for catalog, received:', catalogData.length, 'entries');
        
        return {
          success: true,
          data: catalogData,
          endpoint: request.endpoint.name,
          url: 'governance-service'
        };
      }

      // Special handling for manageable groups - use getManageableGroups instead of generic list_groups
      if (request.endpoint.name === 'list_groups' && request.params.manageableOnly) {
        console.log('👥 MCP: Using manageable groups only for GROUP_MEMBERSHIP_ADMIN');
        
        // Import auth service to get manageable groups
        const { default: oktaAuth } = await import('./okta-auth.ts');
        
        // Get user ID from the stored user context instead of token parsing
        const oktaUserId = this.currentUserContext?.userId;
        console.log('🔍 Using stored user ID from context:', oktaUserId);
        
        if (oktaUserId) {
          const manageableGroups = await oktaAuth.getManageableGroups(oktaUserId);
          console.log('👥 MCP: Found', manageableGroups.length, 'manageable groups for user');
          
          // Convert group names to group objects to match expected format
          const groupObjects = manageableGroups.map(groupName => ({
            id: `group-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
            profile: {
              name: groupName,
              description: 'Group you can manage',
              stats: {
                memberCount: 'Unknown'
              }
            },
            type: 'OKTA_GROUP'
          }));
          
          return {
            success: true,
            data: groupObjects,
            endpoint: request.endpoint.name,
            url: 'manageable-groups-service'
          };
        } else {
          console.warn('❌ Could not determine user ID for manageable groups from context');
          // Fall back to empty array rather than all groups
          return {
            success: true,
            data: [],
            endpoint: request.endpoint.name,
            url: 'manageable-groups-fallback'
          };
        }
      }
      // Build URL with path parameters
      url = `https://${this.domain}${request.endpoint.endpoint}`;
      
      // Replace path parameters
      if (request.endpoint.requiredParams) {
        for (const param of request.endpoint.requiredParams) {
          if (request.params[param]) {
            url = url.replace(`{${param}}`, request.params[param]);
          }
        }
      }

      // Add query parameters for GET requests
      if (request.endpoint.method === 'GET' && Object.keys(request.params).length > 0) {
        const queryParams = new URLSearchParams();
        Object.entries(request.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, value.toString());
          }
        });
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
      }

      console.log(`🔧 MCP: Executing ${request.endpoint.method} ${url}`);

      const headers: Record<string, string> = {
        'Authorization': `SSWS ${this.apiToken}`,
        'Accept': 'application/json',
        'User-Agent': 'Okta-AI-Dashboard-MCP/1.0'
      };

      if (request.endpoint.method !== 'GET' && request.body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method: request.endpoint.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ MCP: ${request.endpoint.name} executed successfully`);
      console.log(`📊 MCP: Data received:`, Array.isArray(data) ? `${data.length} items` : typeof data);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`🔍 MCP: Sample data:`, data[0]);
      }
      
      // Enhanced logging for System Log API
      if (request.endpoint.name === 'get_system_logs') {
        console.log(`🔍 System Log API Debug:`, {
          url: url,
          totalEvents: Array.isArray(data) ? data.length : 'Not an array',
          firstEvent: Array.isArray(data) && data.length > 0 ? data[0] : 'No events',
          eventTypes: Array.isArray(data) ? [...new Set(data.map(log => log.eventType))] : 'N/A',
          params: request.params,
          dataType: typeof data,
          dataKeys: data && typeof data === 'object' ? Object.keys(data) : 'N/A'
        });
        
        if (Array.isArray(data) && data.length === 0) {
          console.log(`⚠️ System Log API returned 0 events - check filter parameters and permissions`);
          console.log(`🔍 Full API response:`, JSON.stringify(data, null, 2));
        }
      }
      
      // Record successful interaction for training
      if (this.trainingService) {
        await this.trainingService.recordInteraction(
          '', // Will be provided by caller
          request.endpoint.name,
          true,
          'user',
          url || 'unknown'
        );
      }
      
      return {
        success: true,
        data,
        endpoint: request.endpoint.name,
        url
      };

    } catch (error) {
      console.error(`❌ MCP: ${request.endpoint.name} failed:`, error);
      
      // Record failed interaction for training
      if (this.trainingService) {
        await this.trainingService.recordInteraction(
          '', // Will be provided by caller
          request.endpoint.name,
          false,
          'user',
          url || 'unknown',
          error.message
        );
      }
      
      return {
        success: false,
        error: error.message,
        endpoint: request.endpoint.name,
        url: url || 'unknown'
      };
    }
  }

  /**
   * Process natural language and execute appropriate API calls with learning
   */
  async processRequest(userMessage: string, userContext?: any): Promise<any> {
    console.log(`🤖 MCP: Processing request: "${userMessage}"`);
    
    // Store user context for use in API calls
    this.currentUserContext = userContext;
    console.log('🔍 Stored user context:', { userId: userContext?.userId, userRole: userContext?.userRole });

    // Record user input for training context
    const interactionId = Date.now().toString();

    // PRIORITY: Handle "I want" messages immediately before any other processing
    if (userMessage.toLowerCase().includes('i want')) {
      const hasJustification = userMessage.includes(' for ');
      console.log('🚀 MCP: Priority handling for "I want" message, hasJustification:', hasJustification);
      
      // Parse duration if present (1 hour, 2 days, etc.)
      const durationMatch = userMessage.match(/(\d+)\s*(hour|day|week|month)s?/i);
      const hasDuration = !!durationMatch;
      
      console.log('🕒 Duration parsing:', { durationMatch, hasDuration });
      
      if (hasJustification && hasDuration) {
        // Full submission with both justification and duration
        return {
          success: true,
          type: 'entitlement_request_submission',
          data: { 
            message: userMessage,
            duration: durationMatch,
            hasJustification: true,
            hasDuration: true
          },
          message: `Submitting access request with justification and duration...`,
          interactionId
        };
      } else if (hasJustification) {
        // Has justification but no duration - show what's needed
        return {
          success: true,
          type: 'entitlement_request_processing',
          data: { message: userMessage, hasJustification: true, hasDuration: false },
          message: `Processing your entitlement request - duration may be required...`,
          interactionId
        };
      } else {
        // No justification - show fields needed
        return {
          success: true,
          type: 'entitlement_fields_lookup',
          data: { message: userMessage },
          message: `Looking up required fields for this entitlement...`,
          interactionId
        };
      }
    }

    // Try to find a documented workflow for this intent
    const { OktaApiDocumentationService } = await import('./okta-api-documentation.ts');
    const workflow = OktaApiDocumentationService.findWorkflowForIntent(userMessage);
    if (workflow) {
      console.log('📋 MCP: Found documented workflow:', workflow.name);
      try {
        const workflowResult = await this.executeWorkflow(workflow, userMessage, userContext);
        
        // Record training data for workflow execution
        if (this.trainingService && workflowResult.success) {
          await this.trainingService.recordInteraction(
            userMessage,
            workflowResult.type || workflow.name,
            workflowResult.success,
            userContext?.userRole || 'regular_user'
          );
        }
        
        return { ...workflowResult, interactionId };
      } catch (error) {
        console.error('❌ MCP: Workflow execution failed:', error);
        // Fall back to legacy processing
      }
    }

    // Fallback to legacy pattern matching
    console.log('⚠️ MCP: Using legacy pattern matching');
    
    // Analyze intent and get API requests
    const apiRequests = await this.analyzeIntent(userMessage, userContext);
    
    if (apiRequests.length === 0) {
      return {
        success: false,
        message: 'Could not determine appropriate API call for this request'
      };
    }

    // Execute API requests
    console.log(`🚀 MCP: Executing ${apiRequests.length} API requests`);
    const results = await Promise.all(
      apiRequests.map(request => this.executeRequest(request, userContext?.accessToken))
    );
    console.log(`📋 MCP: Received ${results.length} results:`, results.map(r => ({ endpoint: r.endpoint, success: r.success, dataCount: Array.isArray(r.data) ? r.data.length : 'N/A' })));

    // Format response based on results
    console.log(`🎨 MCP: Formatting response for: "${userMessage}"`);
    const response = this.formatResponse(userMessage, results);
    console.log(`✨ MCP: Formatted response:`, response.type, response.success);
    
    // Record training data for successful requests
    if (this.trainingService && response.success && response.type) {
      await this.trainingService.recordInteraction(
        userMessage,
        response.type,
        response.success,
        userContext?.userRole || 'regular_user'
      );
    }
    
    return { ...response, interactionId };
  }
  
  async executeWorkflow(workflow: any, message: string, userContext?: any): Promise<any> {
    console.log('🔄 MCP: Executing workflow:', workflow.name);
    
    // Handle governance campaign workflow
    if (workflow.name === 'governance_campaign_creation') {
      console.log('🏛️ MCP: Processing governance campaign request');
      
      try {
        // Use governance service to create/list campaigns
        const { OktaGovernanceService } = await import('./okta-governance-api.ts');
        const governanceService = new OktaGovernanceService();
        
        // List existing campaigns first
        const campaigns = await governanceService.getGovernanceCampaigns(userContext?.accessToken);
        
        console.log('📊 MCP: Found', campaigns.length, 'existing campaigns');
        
        // Create a new campaign if requested
        if (message.toLowerCase().includes('create') || message.toLowerCase().includes('new')) {
          const newCampaign = await governanceService.createGovernanceCampaign(
            `AI Generated Campaign - ${new Date().toISOString().split('T')[0]}`,
            'Automated governance review created by AI assistant',
            userContext?.accessToken
          );
          
          return {
            success: true,
            type: 'governance_campaign_created',
            data: { campaigns, newCampaign },
            message: 'Governance campaign created successfully'
          };
        } else {
          // Just show existing campaigns
          return {
            success: true,
            type: 'governance_campaigns_listed',
            data: { campaigns },
            message: 'Retrieved governance campaigns'
          };
        }
      } catch (error) {
        console.error('❌ MCP: Governance workflow failed:', error);
        return {
          success: false,
          type: 'governance_error',
          error: error.message,
          message: 'Failed to process governance request'
        };
      }
    }
    
    // Determine which steps to execute based on the message
    const lowerMessage = message.toLowerCase();
    let stepsToExecute = [];
    
    if (lowerMessage.includes('request access to')) {
      // Access request flow: list apps -> get entitlements
      stepsToExecute = ['list_applications', 'get_entitlements_for_app'];
    } else if (lowerMessage.includes('i want') && !lowerMessage.includes(' for ')) {
      // Show request fields
      stepsToExecute = ['get_request_fields'];
    } else if (lowerMessage.includes('i want') && lowerMessage.includes(' for ')) {
      // Submit request
      stepsToExecute = ['submit_entitlement_request'];
    } else if (lowerMessage.includes('governance') || lowerMessage.includes('30') || lowerMessage.includes('review')) {
      // 30-day review
      stepsToExecute = ['get_user_apps', 'get_authentication_logs'];
    }
    
    console.log('📋 MCP: Executing workflow steps:', stepsToExecute);
    
    const results = [];
    for (const stepId of stepsToExecute) {
      const step = workflow.steps.find(s => s.stepId === stepId);
      if (step) {
        try {
          const result = await this.executeApiStep(step, message, userContext);
          results.push({ stepId, success: true, data: result, endpoint: step.endpoint });
        } catch (error) {
          console.error(`❌ Step ${stepId} failed:`, error);
          results.push({ stepId, success: false, error: error.message, endpoint: step.endpoint });
        }
      }
    }
    
    return this.processWorkflowResults(workflow.name, results, message);
  }
  
  private async executeApiStep(step: any, message: string, userContext?: any): Promise<any> {
    // Extract dynamic values from the message
    const appNameMatch = message.match(/request access to (.+)/i);
    const entitlementMatch = message.match(/I want (.+?)(?:\s+for|$)/i);
    const justificationMatch = message.match(/I want .+ for (.+)/i);
    
    let url = `https://${this.domain}${step.endpoint}`;
    let params = new URLSearchParams();
    let body: any = null;
    
    // Handle different step types
    switch (step.stepId) {
      case 'list_applications':
        params.append('filter', 'not(parent pr)');
        params.append('limit', '20');
        break;
        
      case 'get_entitlements_for_app':
        // This requires the app ID from previous step - will be handled in workflow results
        return { deferred: 'needs_app_id' };
        
      case 'get_request_fields':
        // This requires entitlement ID - will be handled in workflow results  
        return { deferred: 'needs_entitlement_id' };
        
      case 'submit_entitlement_request':
        // This requires entitlement ID and field values
        return { deferred: 'needs_entitlement_and_fields' };
        
      case 'get_user_apps':
        url = `https://${this.domain}/api/v1/apps`;
        params.append('limit', '200');
        break;
        
      case 'get_authentication_logs':
        url = `https://${this.domain}/api/v1/logs`;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        params.append('filter', `eventType eq "user.authentication.sso" and published gt "${thirtyDaysAgo}"`);
        params.append('limit', '1000');
        break;
    }
    
    const finalUrl = params.toString() ? `${url}?${params}` : url;
    
    const response = await fetch(finalUrl, {
      method: step.method,
      headers: {
        'Authorization': `SSWS ${this.apiToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  private processWorkflowResults(workflowName: string, results: any[], message: string): any {
    console.log('🔄 Processing workflow results for:', workflowName);
    
    if (workflowName === 'access_request_complete_flow') {
      return this.processAccessRequestFlow(results, message);
    } else if (workflowName === 'governance_30day_review') {
      return this.processGovernanceReview(results);
    }
    
    return { success: false, message: 'Unknown workflow' };
  }
  
  private processAccessRequestFlow(results: any[], message: string): any {
    const listAppsResult = results.find(r => r.stepId === 'list_applications');
    
    if (listAppsResult?.success) {
      const apps = listAppsResult.data.data || [];
      const appNameMatch = message.match(/request access to (.+)/i);
      const requestedAppName = appNameMatch?.[1]?.trim().toLowerCase();
      
      const matchingApp = apps.find(app => 
        app.name?.toLowerCase().includes(requestedAppName) ||
        app.displayName?.toLowerCase().includes(requestedAppName) ||
        requestedAppName?.includes(app.name?.toLowerCase())
      );
      
      if (matchingApp) {
        return {
          success: true,
          type: 'access_request_entitlements',
          data: { app: matchingApp, appId: matchingApp.id, appName: matchingApp.name || matchingApp.displayName },
          message: `Found application ${matchingApp.name}, fetching available entitlements...`
        };
      } else {
        return {
          success: false,
          type: 'app_not_found',
          data: { requestedApp: requestedAppName, availableApps: apps.map(a => a.name || a.displayName) },
          message: `Application "${requestedAppName}" not found`
        };
      }
    }
    
    return { success: false, message: 'Failed to retrieve applications' };
  }
  
  private processGovernanceReview(results: any[]): any {
    const appsResult = results.find(r => r.stepId === 'get_user_apps');
    const logsResult = results.find(r => r.stepId === 'get_authentication_logs');
    
    console.log('🔄 Processing governance review results:', { 
      appsFound: !!appsResult?.data, 
      appsCount: appsResult?.data?.length,
      logsFound: !!logsResult?.data,
      logsCount: logsResult?.data?.length 
    });
    
    return {
      success: true,
      type: '30_day_review', // Match the route processing case
      data: {
        apps: appsResult?.data || [],
        logs: logsResult?.data || []
      },
      message: 'Retrieved governance review data successfully'
    };
  }

  /**
   * Record user feedback for continuous learning
   */
  async recordFeedback(
    interactionId: string, 
    feedback: 'positive' | 'negative' | 'neutral',
    correctIntent?: string
  ): Promise<void> {
    if (this.trainingService) {
      await this.trainingService.recordFeedback(interactionId, feedback, correctIntent);
    }
  }

  /**
   * Get training statistics
   */
  getTrainingStats(): any {
    if (this.trainingService) {
      return this.trainingService.getTrainingStats();
    }
    return { message: 'Training service not available' };
  }

  /**
   * Format API results into user-friendly response
   */
  private formatResponse(originalMessage: string, results: any[]): any {
    const message = originalMessage.toLowerCase();
    
    // Handle owned apps requests
    if (message.includes('show my apps') || message.includes('my applications') || message.includes('owned apps')) {
      const appsResult = results.find(r => r.endpoint === 'list_owned_apps');
      if (appsResult?.success && appsResult.data) {
        console.log('📊 MCP: Owned apps result found with', appsResult.data.length, 'entries');
        return {
          success: true,
          type: 'owned_apps',
          data: appsResult.data,
          message: `Found ${appsResult.data?.length || 0} applications you manage`
        };
      }
    }
    
    // Handle governance campaigns with fallback
    if (message.includes('governance campaign') || message.includes('campaign')) {
      const campaignResult = results.find(r => r.endpoint === 'list_governance_campaigns');
      if (campaignResult?.success) {
        console.log('📊 MCP: Governance campaigns result found with', campaignResult.data?.length || 0, 'entries');
        return {
          success: true,
          type: 'governance_campaigns',
          data: campaignResult.data || [],
          message: `Found ${campaignResult.data?.length || 0} governance campaigns`
        };
      } else if (campaignResult) {
        // API call failed, provide helpful error message
        console.log('⚠️ MCP: Governance campaigns API failed:', campaignResult.error);
        return {
          success: true,
          type: 'governance_campaigns',
          data: [],
          message: `**🏛️ Governance Campaigns**\n\n⚠️ Unable to retrieve campaigns from Okta API.\n\n**Possible reasons:**\n• Governance features may not be enabled\n• API endpoint may need different configuration\n• Check with your Okta administrator\n\n**Error:** ${campaignResult.error}\n\n**Manual Access:** Try accessing governance campaigns directly in the Okta Admin Console.`
        };
      }
    }

    // Handle catalog requests with detailed debugging
    if (message.includes('catalog') || message.includes('access request')) {
      const catalogResult = results.find(r => r.endpoint === 'list_catalog_entries');
      if (catalogResult?.success) {
        const catalogData = catalogResult.data;
        const dataLength = Array.isArray(catalogData) ? catalogData.length : (catalogData ? Object.keys(catalogData).length : 0);
        console.log('📊 MCP: Catalog result found with', dataLength, 'entries, data type:', typeof catalogData);
        console.log('📊 MCP: Full catalog data:', JSON.stringify(catalogData, null, 2));
        
        // Check if we have actual data
        if (catalogData && Array.isArray(catalogData) && catalogData.length > 0) {
          return {
            success: true,
            type: 'catalog',
            data: catalogData,
            message: `Found ${dataLength} applications available for request`
          };
        } else if (catalogData && typeof catalogData === 'object') {
          // Handle non-array responses
          const entries = catalogData.entries || catalogData.items || catalogData.applications || [];
          if (entries.length > 0) {
            return {
              success: true,
              type: 'catalog',
              data: entries,
              message: `Found ${entries.length} applications available for request`
            };
          }
        }
        
        // API succeeded but returned empty data
        console.log('📊 MCP: Catalog API succeeded but returned empty data');
        return {
          success: true,
          type: 'catalog',
          data: [],
          message: 'IGA catalog API returned no entries - may be empty or not configured'
        };
      } else {
        console.log('⚠️ MCP: Catalog result failed:', catalogResult?.error);
        // Return error information for debugging
        return {
          success: true,
          type: 'catalog',
          data: [],
          message: `Catalog API failed: ${catalogResult?.error || 'Unknown error'}`
        };
      }
    }

    // Handle group management responses
    if (message.includes('groups') && (message.includes('manage') || message.includes('list') || message.includes('show'))) {
      const groupResult = results.find(r => r.endpoint === 'list_groups');
      if (groupResult?.success) {
        return {
          success: true,
          type: 'group_management',
          data: results,
          message: 'Retrieved manageable groups successfully'
        };
      } else {
        return {
          success: false,
          type: 'group_management_error',
          error: groupResult?.error || 'Failed to retrieve groups',
          message: `Groups API failed: ${groupResult?.error || 'Unknown error'}`
        };
      }
    }

    // Handle 30-day reviews with better processing
    if (message.includes('30-day') || message.includes('review') || message.includes('unused') || message.includes('governance review')) {
      const userAppsResult = results.find(r => r.endpoint === 'list_user_apps');
      const systemLogsResult = results.find(r => r.endpoint === 'get_system_logs');
      
      console.log('🔍 MCP: 30-day review processing:', {
        userAppsSuccess: userAppsResult?.success,
        systemLogsSuccess: systemLogsResult?.success,
        userAppsCount: userAppsResult?.data?.length,
        systemLogsCount: systemLogsResult?.data?.length
      });
      
      if (userAppsResult?.success || systemLogsResult?.success) {
        const processedReview = this.process30DayReview(results);
        return {
          success: true,
          type: '30_day_review',
          data: results,
          message: processedReview
        };
      } else {
        return {
          success: true,
          type: '30_day_review',
          data: results,
          message: `**📊 30-Day Access Review - AI Enhanced**\n\n❌ Unable to retrieve comprehensive data. API responses:\n${results.map(r => `• ${r.endpoint}: ${r.success ? 'Success' : 'Failed'}`).join('\n')}\n\n**Possible Issues:**\n• System Log API may need additional permissions\n• User Apps API may be restricted\n• Check your Okta API token permissions\n\n**Manual Review:** Try accessing reports directly in Okta Admin Console under Reports → System Log\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`
        };
      }
    }

    // Remove duplicate - this is now handled by workflow-based processing

    // Handle access request submissions - first get available entitlements
    if (message.includes('request access to')) {
      const appNameMatch = message.match(/request access to (.+)/i);
      const appName = appNameMatch ? appNameMatch[1].trim() : 'application';
      
      // Check if we have catalog data to find the app ID
      const catalogResult = results.find(r => r.endpoint === 'list_catalog_entries');
      if (catalogResult?.success && catalogResult.data) {
        const app = catalogResult.data.find(app => app.displayName?.toLowerCase().includes(appName.toLowerCase()));
        
        if (app) {
          // Use parent API to get available entitlements for this app
          return {
            success: true,
            type: 'access_request_entitlements',
            data: { app, appId: app.id, appName: app.displayName },
            message: `**🔍 Finding Available Entitlements**\n\nChecking available access options for **${app.displayName}**...\n\nUsing parent API to retrieve specific roles and entitlements you can request.\n\n*Please wait while I fetch the available access levels...*`
          };
        } else {
          return {
            success: true,
            type: 'access_request_app_not_found',
            data: { appName },
            message: `**❌ Application Not Found**\n\n**${appName}** was not found in the IGA catalog.\n\n**Available Applications:**\n${catalogResult.data?.map(app => `• ${app.displayName}`).join('\n') || 'None found'}\n\n**Try again with exact application name from the list above.**\n\n**Feedback:** 👍 👎 (Help improve accuracy)`
          };
        }
      }
      
      const requestResult = results.find(r => r.endpoint === 'submit_access_request');
      if (requestResult?.success) {
        return {
          success: true,
          type: 'access_request_submitted',
          data: requestResult.data,
          message: 'Access request submitted successfully'
        };
      } else {
        return {
          success: true,
          type: 'access_request_failed',
          data: { appName, error: requestResult?.error },
          message: `**❌ Access Request Failed**\n\nUnable to submit request for **${appName}**.\n\n**Error:** ${requestResult?.error || 'Unknown error'}\n\n**Next Steps:**\n• Verify the application is available in the catalog\n• Check if you have permission to request access\n• Contact your Okta administrator if issues persist\n\n**Feedback:** 👍 👎 (Help improve accuracy)`
        };
      }
    }

    // Default response
    return {
      success: results.some(r => r.success),
      results,
      message: 'API requests completed'
    };
  }
}
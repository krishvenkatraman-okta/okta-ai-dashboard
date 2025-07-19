/**
 * Okta Model Context Protocol (MCP) Server
 * Intelligent API mapping and execution based on natural language
 */

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
    // Governance Campaign APIs
    {
      name: 'create_governance_campaign',
      method: 'POST',
      endpoint: '/governance/api/v2/campaigns',
      description: 'Create a governance campaign for access reviews',
      bodySchema: {
        name: 'string',
        description: 'string',
        applicationIds: 'array',
        reviewers: 'array',
        duration: 'number',
        durationUnit: 'string'
      }
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
      // Find the user apps and system logs results
      const userAppsResult = results.find(r => r.endpoint === 'list_user_apps');
      const systemLogsResult = results.find(r => r.endpoint === 'get_system_logs');

      if (!userAppsResult?.data && !systemLogsResult?.data) {
        return `**📊 30-Day Access Review - AI Enhanced**\n\n❌ Unable to retrieve application data. Please check your API permissions.\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`;
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

    // Specific app access request
    const accessMatch = message.match(/request access to (.+)/i);
    if (accessMatch) {
      const appName = accessMatch[1].trim();
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'submit_access_request')!,
        params: { appName },
        body: {
          justification: `Access needed for ${appName} - requested via AI assistant`,
          duration: 90,
          durationUnit: 'days'
        }
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
      
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'get_system_logs')!,
        params: {
          filter: `eventType eq "user.authentication.sso"`,
          since: thirtyDaysAgo.toISOString(),
          limit: 500
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

    // Governance campaign creation
    if (message.includes('create campaign') || message.includes('governance campaign')) {
      requests.push({
        endpoint: this.endpoints.find(e => e.name === 'create_governance_campaign')!,
        params: {},
        body: {
          name: 'AI-Generated Access Review Campaign',
          description: 'Automated governance campaign created via AI assistant',
          duration: 14,
          durationUnit: 'days'
        }
      });
    }

    return requests;
  }

  /**
   * Execute API request with proper authentication and error handling
   */
  async executeRequest(request: ApiRequest, userToken?: string): Promise<any> {
    try {
      // Build URL with path parameters
      let url = `https://${this.domain}${request.endpoint.endpoint}`;
      
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
        endpoint: request.endpoint.name
      };
    }
  }

  /**
   * Process natural language and execute appropriate API calls with learning
   */
  async processRequest(userMessage: string, userContext?: any): Promise<any> {
    console.log(`🤖 MCP: Processing request: "${userMessage}"`);

    // Record user input for training context
    const interactionId = Date.now().toString();

    // Analyze intent and get API requests
    const apiRequests = await this.analyzeIntent(userMessage, userContext);
    
    if (apiRequests.length === 0) {
      return {
        success: false,
        message: 'Could not determine appropriate API call for this request'
      };
    }

    // Execute API requests
    const results = await Promise.all(
      apiRequests.map(request => this.executeRequest(request, userContext?.accessToken))
    );

    // Format response based on results
    const response = this.formatResponse(userMessage, results);
    
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
    
    // Handle catalog requests
    if (message.includes('catalog') || message.includes('access request')) {
      const catalogResult = results.find(r => r.endpoint === 'list_catalog_entries');
      if (catalogResult?.success) {
        return {
          success: true,
          type: 'catalog',
          data: catalogResult.data,
          message: `Found ${catalogResult.data?.length || 0} applications available for request`
        };
      }
    }

    // Handle 30-day reviews
    if (message.includes('30-day') || message.includes('review')) {
      const hasRelevantData = results.some(r => 
        (r.endpoint === 'get_system_logs' || r.endpoint === 'list_user_apps') && r.success
      );
      
      if (hasRelevantData) {
        const processedReview = this.process30DayReview(results);
        return {
          success: true,
          type: '30_day_review',
          data: results,
          message: processedReview
        };
      }
    }

    // Handle access request submissions
    if (message.includes('request access to')) {
      const requestResult = results.find(r => r.endpoint === 'submit_access_request');
      if (requestResult?.success) {
        return {
          success: true,
          type: 'access_request_submitted',
          data: requestResult.data,
          message: 'Access request submitted successfully'
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
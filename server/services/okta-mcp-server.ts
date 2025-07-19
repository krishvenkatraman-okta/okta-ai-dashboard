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
      name: 'list_governance_campaigns',
      method: 'GET',
      endpoint: '/governance/api/v2/campaigns',
      description: 'List existing governance campaigns for access reviews',
      optionalParams: ['limit', 'after', 'status']
    },
    {
      name: 'list_owned_apps',
      method: 'GET', 
      endpoint: '/api/v1/apps',
      description: 'List applications owned or managed by the current user',
      optionalParams: ['filter', 'limit', 'after']
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
      console.log(`📊 MCP: Data received:`, Array.isArray(data) ? `${data.length} items` : typeof data);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`🔍 MCP: Sample data:`, data[0]);
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
    
    // Handle governance campaigns
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
      }
    }

    // Handle catalog requests
    if (message.includes('catalog') || message.includes('access request')) {
      const catalogResult = results.find(r => r.endpoint === 'list_catalog_entries');
      if (catalogResult?.success) {
        const catalogData = catalogResult.data;
        const dataLength = Array.isArray(catalogData) ? catalogData.length : (catalogData ? Object.keys(catalogData).length : 0);
        console.log('📊 MCP: Catalog result found with', dataLength, 'entries, data type:', typeof catalogData);
        console.log('📊 MCP: Raw catalog data:', JSON.stringify(catalogData).substring(0, 200) + '...');
        
        if (catalogData && ((Array.isArray(catalogData) && catalogData.length > 0) || (typeof catalogData === 'object' && Object.keys(catalogData).length > 0))) {
          return {
            success: true,
            type: 'catalog',
            data: catalogData,
            message: `Found ${dataLength} applications available for request`
          };
        }
      } else {
        console.log('⚠️ MCP: Catalog result failed or no data:', catalogResult);
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
      } else {
        return {
          success: true,
          type: '30_day_review',
          data: results,
          message: `**📊 30-Day Access Review - AI Enhanced**\n\n❌ Unable to retrieve comprehensive data. API responses:\n${results.map(r => `• ${r.endpoint}: ${r.success ? 'Success' : 'Failed'}`).join('\n')}\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`
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
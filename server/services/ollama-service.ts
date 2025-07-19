export class OllamaService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = 'http://localhost:11434';
  }

  async initialize(): Promise<void> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        console.log('Starting Ollama...');
        await this.startOllama();
      }

      // Check if llama3.1:8b is available, if not pull it
      await this.ensureModel('llama3.1:8b');
    } catch (error) {
      console.warn('Ollama initialization failed:', error);
    }
  }

  private async startOllama(): Promise<void> {
    // Ollama should be started externally, just wait a bit
    console.log('Waiting for Ollama to be ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  private async ensureModel(model: string): Promise<void> {
    try {
      const modelsResponse = await fetch(`${this.baseUrl}/api/tags`);
      if (modelsResponse.ok) {
        const models = await modelsResponse.json();
        const hasModel = models.models?.some((m: any) => m.name.includes(model.split(':')[0]));
        
        if (!hasModel) {
          console.log(`Pulling ${model} model...`);
          await this.pullModel(model);
        }
      }
    } catch (error) {
      console.warn('Model check failed:', error);
    }
  }

  private async pullModel(model: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`);
      }
    } catch (error) {
      console.warn(`Failed to pull model ${model}:`, error);
    }
  }

  async generateResponse(prompt: string, userRole?: string): Promise<string> {
    // First check if this should trigger a direct function call
    const functionCall = this.detectFunctionCall(prompt, userRole);
    if (functionCall) {
      return JSON.stringify(functionCall);
    }

    try {
      const systemPrompt = `You are an expert Okta governance and identity management assistant that can perform actual tasks. You help users with:

**Available Actions:**
1. **Access Reviews**: Check which applications haven't been used in 30+ days
2. **Governance Campaigns**: Create automated access review campaigns for app owners
3. **Application Catalog**: Browse and request access to available applications
4. **Owned Applications**: Show applications you own (for app owners)

**User Role:** ${userRole || 'user'}
**Request:** ${prompt}

**Instructions:**
- Be concise and helpful
- When users ask about specific actions, perform them rather than just explaining
- For app owners: Focus on governance and application management
- For regular users: Focus on access requests and self-service

**Response:**`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3.1:8b',
          prompt: systemPrompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9,
            max_tokens: 500
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const result = await response.json();
      return result.response || "I'm processing your request. Please try again.";
    } catch (error) {
      console.error('Ollama generation error:', error);
      // Fallback to rule-based responses when Ollama is unavailable
      return this.generateFallbackResponse(prompt, userRole);
    }
  }

  private detectFunctionCall(prompt: string, userRole?: string): any {
    const lowerPrompt = prompt.toLowerCase();
    
    // Detect "show my apps" or "owned applications" intent
    if (lowerPrompt.includes('show my apps') || lowerPrompt.includes('owned applications') || lowerPrompt.includes('my applications')) {
      return {
        type: 'function_call',
        function: 'fetch_owned_apps',
        arguments: {},
        message: 'Let me fetch your owned applications...'
      };
    }
    
    // Detect 30-day review intent
    if (lowerPrompt.includes('30-day') || lowerPrompt.includes('unused') || lowerPrompt.includes('cleanup') || 
        (lowerPrompt.includes('review') && lowerPrompt.includes('access'))) {
      return {
        type: 'function_call',
        function: 'fetch_30_day_review',
        arguments: {},
        message: 'Let me check your unused applications from the last 30 days...'
      };
    }
    
    // Detect access request intent FIRST (most specific pattern)
    if (lowerPrompt.includes('access request') || lowerPrompt.includes('request access') || 
        lowerPrompt.includes('apply for') || lowerPrompt.includes('need access to') ||
        lowerPrompt.includes('catalog') || lowerPrompt.includes('available apps') || 
        lowerPrompt.includes('browse applications') || lowerPrompt.includes('what can I request')) {
      return {
        type: 'function_call',
        function: 'fetch_catalog',
        arguments: {},
        message: 'Let me fetch the available applications catalog for your access request...'
      };
    }
    

    
    // Detect governance campaign creation
    if (lowerPrompt.includes('create campaign') || lowerPrompt.includes('governance campaign') || 
        lowerPrompt.includes('start campaign')) {
      return null; // Let the regular response handle this with guidance
    }
    
    return null;
  }

  private generateFallbackResponse(prompt: string, userRole?: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('30 days') || (lowerPrompt.includes('access') && lowerPrompt.includes('review'))) {
      return `I can help you review access from the last 30 days. Here's what I can do:

**Access Review Options:**
• Show applications you've accessed recently
• Identify unused applications that could be revoked
• Generate access compliance reports
• Recommend access cleanup actions

Would you like me to show your recent application access?`;
    }

    if (lowerPrompt.includes('governance') || lowerPrompt.includes('campaign')) {
      if (userRole === 'regular_user') {
        return `**Access Level: Regular User**

Governance campaigns require administrative privileges. Here's what you can do instead:

• Review your own application access
• Request access to new applications
• View your access history
• Submit feedback on access processes

Would you like me to show your current access or help you request new applications?`;
      }
      
      return `I can help you with governance campaigns:

**Campaign Options:**
• Create automated access review campaigns
• Set up recurring access audits
• Configure approval workflows
• Generate compliance reports

What type of governance campaign would you like to create?`;
    }

    if (lowerPrompt.includes('catalog') || lowerPrompt.includes('request') || lowerPrompt.includes('available')) {
      return `I can help you with access requests:

**Available Actions:**
• Browse available applications to request
• Submit access requests with justification
• Track existing request status
• View approval workflows

Would you like to see available applications you can request access to?`;
    }

    return `Hi! I'm your Okta Assistant. I can help you with:

**Available Services:**
• **Access Reviews**: Review your application access
• **Governance**: Manage access campaigns (admin users)
• **Access Requests**: Request new application access
• **Compliance**: Ensure proper access management

${userRole ? `\n**Your Access Level**: ${userRole === 'super_admin' ? 'Super Admin' : userRole === 'app_owner' ? 'App Owner' : 'Standard User'}` : ''}

What would you like to do today?`;
  }

  async analyzeGovernanceIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    parameters: Record<string, any>;
    suggestedAction: string;
  }> {
    try {
      const analysisPrompt = `Analyze this governance request and extract structured information:

"${message}"

Respond with JSON only:
{
  "intent": "access_review|governance_campaign|access_request|user_management|general_query",
  "confidence": 0.0-1.0,
  "parameters": {
    "appName": "extracted app name or null",
    "timeframe": "extracted timeframe like '30 days' or null", 
    "action": "create|list|review|revoke|grant",
    "justification": "extracted justification or null"
  },
  "suggestedAction": "specific next step to take"
}`;

      const response = await this.generateResponse(analysisPrompt);
      
      try {
        return JSON.parse(response);
      } catch {
        // Fallback to simple pattern matching if JSON parsing fails
        return this.fallbackIntentAnalysis(message);
      }
    } catch (error) {
      console.error('Intent analysis error:', error);
      return this.fallbackIntentAnalysis(message);
    }
  }

  private fallbackIntentAnalysis(message: string): {
    intent: string;
    confidence: number;
    parameters: Record<string, any>;
    suggestedAction: string;
  } {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('30 days') || (lowerMessage.includes('access') && lowerMessage.includes('review'))) {
      return {
        intent: 'access_review',
        confidence: 0.8,
        parameters: { timeframe: '30 days' },
        suggestedAction: 'Show applications accessed in the last 30 days'
      };
    }
    
    if (lowerMessage.includes('campaign') || lowerMessage.includes('governance')) {
      return {
        intent: 'governance_campaign',
        confidence: 0.8,
        parameters: {},
        suggestedAction: 'Create or manage governance campaigns'
      };
    }

    if (lowerMessage.includes('catalog') || lowerMessage.includes('request') || lowerMessage.includes('available')) {
      return {
        intent: 'access_request',
        confidence: 0.8,
        parameters: {},
        suggestedAction: 'Show available applications to request'
      };
    }

    if (lowerMessage.includes('user') || lowerMessage.includes('manage')) {
      return {
        intent: 'user_management',
        confidence: 0.7,
        parameters: {},
        suggestedAction: 'Provide user management assistance'
      };
    }

    return {
      intent: 'general_query',
      confidence: 0.5,
      parameters: {},
      suggestedAction: 'Provide general assistance'
    };
  }
}
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

  async generateResponse(prompt: string, context?: string): Promise<string> {
    try {
      const systemPrompt = `You are an expert Okta governance and identity management assistant. You help users with:

1. **Access Reviews**: Analyzing user access patterns and recommending access revocation for unused applications
2. **Governance Campaigns**: Creating and managing automated access review campaigns 
3. **Access Requests**: Helping users request access to applications through proper channels
4. **Compliance**: Ensuring access follows organizational policies

**Response Guidelines:**
- Be concise and professional
- Provide actionable recommendations
- Use structured responses with clear next steps
- Ask clarifying questions when needed
- Focus on governance, compliance, and access management

**Context:** You have access to Okta APIs for real governance operations.

${context ? `**Current Context:**\n${context}\n\n` : ''}

**User Request:** ${prompt}

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
      return this.generateFallbackResponse(prompt, context);
    }
  }

  private generateFallbackResponse(prompt: string, context?: string): string {
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
      if (context?.includes('regular_user')) {
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

${context ? `\n**Your Access Level**: ${context.split('User Access Level: ')[1]?.split('\n')[0] || 'Standard User'}` : ''}

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
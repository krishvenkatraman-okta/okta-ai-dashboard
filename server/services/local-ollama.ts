import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class LocalOllamaService {
  private readonly baseUrl = 'http://localhost:11434';
  private ollamaProcess: any = null;

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Starting Ollama service...');
      await this.startOllamaService();
      await this.waitForOllama();
      await this.pullModel('llama3.1:8b');
      console.log('✅ Ollama initialized successfully with Llama 3.1 8B');
    } catch (error) {
      console.warn('⚠️ Ollama initialization failed, using fallback responses:', error);
    }
  }

  private async startOllamaService(): Promise<void> {
    try {
      // Try using npm installed ollama first
      const { stdout } = await execAsync('npx ollama --version');
      console.log('Found Ollama version:', stdout.trim());
      
      // Start Ollama server using npm package
      this.ollamaProcess = spawn('npx', ['ollama', 'serve'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.ollamaProcess.stdout?.on('data', (data: Buffer) => {
        console.log('Ollama:', data.toString());
      });

      this.ollamaProcess.stderr?.on('data', (data: Buffer) => {
        console.log('Ollama error:', data.toString());
      });

    } catch (error) {
      console.log('NPM Ollama not found, trying direct binary approach...');
      // Fallback to downloading binary
      await this.downloadAndStartOllama();
    }
  }

  private async downloadAndStartOllama(): Promise<void> {
    try {
      // Download Ollama binary for Linux
      console.log('📥 Downloading Ollama binary...');
      await execAsync('curl -L https://github.com/ollama/ollama/releases/download/v0.1.17/ollama-linux-amd64 -o /tmp/ollama-bin');
      await execAsync('chmod +x /tmp/ollama-bin');
      
      // Start Ollama
      this.ollamaProcess = spawn('/tmp/ollama-bin', ['serve'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      console.log('🔄 Ollama binary started');
    } catch (error) {
      throw new Error(`Failed to download/start Ollama: ${error}`);
    }
  }

  private async waitForOllama(): Promise<void> {
    console.log('⏳ Waiting for Ollama to be ready...');
    let retries = 30;
    
    while (retries > 0) {
      try {
        const response = await fetch(`${this.baseUrl}/api/tags`);
        if (response.ok) {
          console.log('✅ Ollama is ready');
          return;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      retries--;
    }
    
    throw new Error('Ollama failed to start within 60 seconds');
  }

  private async pullModel(model: string): Promise<void> {
    try {
      console.log(`📦 Pulling model: ${model}`);
      
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      });

      if (response.ok) {
        console.log(`✅ Model ${model} pulled successfully`);
      } else {
        throw new Error(`Failed to pull model: ${response.status}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to pull model ${model}:`, error);
    }
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    try {
      console.log('🤖 Generating AI response for prompt:', prompt);
      
      // Check if Ollama is available and has models
      const healthCheck = await fetch(`${this.baseUrl}/api/tags`);
      if (!healthCheck.ok) {
        console.log('❌ Ollama not available, using fallback response');
        return this.getFallbackResponse(prompt);
      }

      const modelsData = await healthCheck.json();
      if (!modelsData.models || modelsData.models.length === 0) {
        console.log('❌ No models available in Ollama, using fallback response');
        return this.getFallbackResponse(prompt);
      }

      console.log('✅ Ollama models available:', modelsData.models.map((m: any) => m.name));

      // Use first available model if llama3.1:8b is not available
      const availableModel = modelsData.models.find((m: any) => m.name === 'llama3.1:8b') 
        || modelsData.models[0];
      
      if (!availableModel) {
        console.log('❌ No suitable model found, using fallback response');
        return this.getFallbackResponse(prompt);
      }

      const modelName = availableModel.name;
      console.log('🤖 Using model:', modelName);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 300
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Ollama response received');
        return data.response || 'I apologize, but I was unable to generate a response at this time.';
      } else {
        console.log(`❌ Ollama API error: ${response.status}`);
        throw new Error(`Ollama API error: ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ Ollama generation failed:', error);
      return this.getFallbackResponse(prompt);
    }
  }

  private getFallbackResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('30 days') || (lowerPrompt.includes('access') && lowerPrompt.includes('review'))) {
      return `**Access Review (30 Days)**

I can help you review applications accessed in the last 30 days:

• Show recently accessed applications
• Identify unused access that could be revoked  
• Generate access compliance reports
• Recommend cleanup actions

Would you like me to show your recent application access?`;
    }

    if (lowerPrompt.includes('governance') || lowerPrompt.includes('campaign')) {
      
      return `**Governance Campaign Creation**

I can help you create governance campaigns:

• Set up automated access reviews
• Configure approval workflows  
• Generate compliance reports
• Schedule recurring audits

What type of campaign would you like to create?`;
    }
    
    if (lowerPrompt.includes('access request') || lowerPrompt.includes('request access')) {
      return `I can help you with access requests! As your Okta Assistant, I can guide you through:

**Access Request Process:**
• Browse the application catalog to see available apps
• Submit requests with proper business justification
• Track approval status and follow up with approvers
• Get notified when access is granted

**Available Applications:**
• Enterprise applications assigned to your organization
• Self-service applications you can request instantly
• Managed applications requiring manager approval

Would you like me to show you available applications to request, or help with a specific access request?`;
    }
    
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.includes('hey')) {
      return `Hello! I'm your Okta Assistant. I'm here to help you manage your identity and access needs.

**What I can help you with:**
• **Access Requests**: Request access to applications and resources
• **Application Management**: View and manage your assigned applications
• **Governance Tasks**: Handle compliance and access reviews (admin users)
• **User Administration**: Manage users, groups, and permissions

**Your current access level**: Super Admin - You have full administrative capabilities.

What would you like to work on today?`;
    }
    
    if (lowerPrompt.includes('applications') || lowerPrompt.includes('apps')) {
      return `I can help you manage applications! Here's what I can do:

• **Show Available Apps**: View applications you can request access to
• **Recent Access**: Display applications you've accessed recently
• **Request Access**: Help you request access to new applications
• **Manage Assignments**: Review your current application assignments

What specific application help do you need?`;
    }
    
    // Default conversational response
    return `I'm your Okta Assistant! I understand you're asking about "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}".

**I can help you with:**
• **Access Requests**: Request access to applications and resources
• **Application Management**: View your current applications and manage access
• **Governance & Compliance**: Handle access reviews and governance campaigns
• **User & Group Management**: Manage organizational users and permissions

**Your Role**: Super Admin - Full administrative access enabled.

Could you tell me more specifically what you'd like to do? For example:
- "Show me available applications"
- "Help me request access to [app name]"
- "Create a governance campaign"
- "Review user access"`;
  }

  async analyzeIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    parameters: Record<string, any>;
    suggestedAction: string;
  }> {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('30 days') || (lowerMessage.includes('access') && lowerMessage.includes('review'))) {
      return {
        intent: 'access_review',
        confidence: 0.9,
        parameters: { timeframe: '30 days' },
        suggestedAction: 'Show applications accessed in the last 30 days'
      };
    }
    
    if (lowerMessage.includes('campaign') || lowerMessage.includes('governance')) {
      return {
        intent: 'governance_campaign', 
        confidence: 0.85,
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

    return {
      intent: 'general_query',
      confidence: 0.6,
      parameters: {},
      suggestedAction: 'Provide general assistance'
    };
  }

  cleanup(): void {
    if (this.ollamaProcess) {
      console.log('🔄 Stopping Ollama service...');
      this.ollamaProcess.kill('SIGTERM');
    }
  }
}
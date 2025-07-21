import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class LocalOllamaService {
  private readonly baseUrl = 'http://localhost:11434';
  private ollamaProcess: any = null;

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Starting Ollama service...');
      
      // Check if Ollama is already running first
      const isRunning = await this.checkOllamaRunning();
      if (isRunning) {
        console.log('✅ Ollama already running, skipping initialization');
        await this.pullModel('llama3.2:1b');
        console.log('✅ Ollama service ready with Llama 3.2 1B');
        return;
      }
      
      await this.startOllamaService();
      await this.waitForOllama();
      await this.pullModel('llama3.2:1b');
      console.log('✅ Ollama initialized successfully with Llama 3.2 1B');
    } catch (error) {
      console.warn('⚠️ Ollama initialization failed, using fallback responses:', error);
      // Mark service as failed but don't crash
      this.isFailedMode = true;
    }
  }

  private isFailedMode = false;

  private async checkOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (error) {
      return false;
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
      // Clean up any existing Ollama processes/files first
      console.log('🧹 Cleaning up existing Ollama processes...');
      try {
        await execAsync('pkill -f ollama || true');
        await execAsync('rm -f /tmp/ollama-bin || true');
      } catch (e) {
        // Ignore cleanup errors
      }
      
      // Check if binary already exists and is valid
      try {
        const { stdout } = await execAsync('/tmp/ollama-bin --version || echo "not found"');
        if (!stdout.includes('not found')) {
          console.log('📁 Using existing Ollama binary');
          this.ollamaProcess = spawn('/tmp/ollama-bin', ['serve'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
          });
          console.log('🔄 Ollama binary started');
          return;
        }
      } catch (e) {
        // Binary doesn't exist, continue with download
      }
      
      // Download with retry logic and timeout
      console.log('📥 Downloading Ollama binary...');
      const downloadCmd = 'timeout 30 curl -L --connect-timeout 10 --max-time 60 https://github.com/ollama/ollama/releases/download/v0.3.0/ollama-linux-amd64 -o /tmp/ollama-bin';
      
      try {
        await execAsync(downloadCmd);
        await execAsync('chmod +x /tmp/ollama-bin');
        
        // Start Ollama
        this.ollamaProcess = spawn('/tmp/ollama-bin', ['serve'], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        console.log('🔄 Ollama binary started');
      } catch (downloadError) {
        // If download fails, throw to trigger fallback mode
        throw new Error(`Download failed: ${downloadError}. Will use pattern-based fallback.`);
      }
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
        // Read the streaming response to completion
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.status) {
                  console.log(`📦 ${model}: ${data.status}`);
                }
                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (parseError) {
                // Skip invalid JSON lines
              }
            }
          }
        }
        console.log(`✅ Model ${model} pulled successfully`);
      } else {
        const error = await response.text();
        throw new Error(`Failed to pull model: ${response.status} - ${error}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to pull model ${model}:`, error);
      // Try alternative smaller models
      if (model === 'llama3.2:1b') {
        console.log('🔄 Trying even smaller model: gemma2:2b');
        await this.pullModel('gemma2:2b');
      }
    }
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    try {
      console.log('🤖 Generating AI response for prompt:', prompt);
      console.log('🤖 Context:', context);
      
      // Check if we have models loaded and try LLM first
      const healthCheck = await fetch(`${this.baseUrl}/api/tags`);
      if (healthCheck.ok) {
        const modelsData = await healthCheck.json();
        if (modelsData.models && modelsData.models.length > 0) {
          console.log('✅ Using loaded Ollama model for response generation');
          const modelName = modelsData.models[0].name;
          
          const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              prompt: `Context: ${context || 'Okta identity management assistant'}\n\nUser message: ${prompt}\n\nResponse:`,
              stream: false,
              options: { temperature: 0.7, num_predict: 200 }
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.response) {
              console.log('✅ Generated LLM response');
              return data.response;
            }
          }
        }
      }
      
      // Fall back to intelligent pattern-based responses
      console.log('🔄 Using intelligent fallback response system');
      return this.getFallbackResponse(prompt);
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
    // If Ollama is in failed mode, use pattern-based classification immediately
    if (this.isFailedMode) {
      console.log('🔄 Using fallback classification due to Ollama failure');
      return this.getPatternBasedIntent(message);
    }

    try {
      // Try Ollama first if available
      const ollamaResult = await this.getOllamaIntent(message);
      if (ollamaResult) {
        return ollamaResult;
      }
    } catch (error) {
      console.log('⚠️ Ollama intent analysis failed, using pattern fallback');
    }

    // Fallback to pattern-based classification
    return this.getPatternBasedIntent(message);
  }

  private getPatternBasedIntent(message: string): {
    intent: string;
    confidence: number;
    parameters: Record<string, any>;
    suggestedAction: string;
  } {
    const lowerMessage = message.toLowerCase();
    
    // Check for entitlement requests first (highest priority)
    if (lowerMessage.startsWith('request ') && !lowerMessage.includes('request access to ')) {
      return {
        intent: 'entitlement_request',
        confidence: 0.9,
        parameters: { entitlementName: message.substring(8).trim() },
        suggestedAction: 'Process entitlement request'
      };
    }
    
    // Check for group management patterns
    const groupPatterns = ['group management', 'group operations', 'show my groups', 'manage groups'];
    if (groupPatterns.some(pattern => lowerMessage.includes(pattern))) {
      return {
        intent: 'group_management',
        confidence: 0.9,
        parameters: {},
        suggestedAction: 'Handle group management operations'
      };
    }
    
    // Check for catalog requests
    if (lowerMessage.includes('list available applications') || 
        lowerMessage.includes('applications to request') ||
        lowerMessage.includes('available apps') ||
        lowerMessage.includes('show catalog')) {
      return {
        intent: 'catalog_request',
        confidence: 0.8,
        parameters: {},
        suggestedAction: 'Show available applications catalog'
      };
    }
    
    // Check for access level inquiries
    if (lowerMessage.includes('access level') || lowerMessage.includes('current access') ||
        lowerMessage.includes('what can i do')) {
      return {
        intent: 'access_level_inquiry',
        confidence: 0.8,
        parameters: {},
        suggestedAction: 'Show user access level and capabilities'
      };
    }
    
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

    // Default fallback
    return {
      intent: 'general_inquiry',
      confidence: 0.3,
      parameters: {},
      suggestedAction: 'Provide general assistance'
    };
  }

  private async getOllamaIntent(message: string): Promise<any> {
    try {
      const healthCheck = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      
      if (!healthCheck.ok) {
        return null;
      }
      
      const modelsData = await healthCheck.json();
      if (!modelsData.models || modelsData.models.length === 0) {
        return null;
      }
      
      const modelName = modelsData.models[0].name;
      const prompt = `Analyze this user message and classify the intent. Return ONLY a JSON object with intent, confidence, parameters, and suggestedAction.

Message: "${message}"

Intent categories:
- entitlement_request: "request [specific item]" format
- group_management: group operations, show groups
- catalog_request: list apps, show catalog 
- access_level_inquiry: what can I do, access level
- access_review: 30-day review, unused apps
- governance_campaign: governance tasks
- general_inquiry: everything else

JSON:`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt,
          stream: false,
          options: { temperature: 0.1, num_predict: 100 }
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.response) {
          try {
            return JSON.parse(data.response.trim());
          } catch (parseError) {
            console.log('Failed to parse Ollama JSON response');
            return null;
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  cleanup(): void {
    if (this.ollamaProcess) {
      console.log('🔄 Stopping Ollama service...');
      this.ollamaProcess.kill('SIGTERM');
    }
  }
}
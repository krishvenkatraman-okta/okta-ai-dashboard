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
      const systemPrompt = `You are an expert Okta governance assistant specializing in identity and access management.

**Your Role:**
- Help users with access reviews, governance campaigns, and compliance
- Provide actionable recommendations for access management
- Be concise, professional, and security-focused

**Context:** ${context || 'General Okta assistance'}

**User Query:** ${prompt}

**Response (be concise and actionable):**`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.1:8b',
          prompt: systemPrompt,
          stream: false,
          options: {
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 400
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.response || this.generateFallback(prompt, context);
      } else {
        return this.generateFallback(prompt, context);
      }
    } catch (error) {
      console.error('Ollama generation error:', error);
      return this.generateFallback(prompt, context);
    }
  }

  private generateFallback(prompt: string, context?: string): string {
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
      if (context?.includes('regular_user')) {
        return `**Access Level: Regular User**

Governance campaigns require admin privileges. You can:

• Review your own application access
• Request access to new applications  
• View your access history

Would you like to see available applications to request?`;
      }
      
      return `**Governance Campaign Creation**

I can help you create governance campaigns:

• Set up automated access reviews
• Configure approval workflows
• Generate compliance reports
• Schedule recurring audits

What type of campaign would you like to create?`;
    }

    if (lowerPrompt.includes('catalog') || lowerPrompt.includes('request') || lowerPrompt.includes('available')) {
      return `**Access Request Catalog**

Available actions:

• Browse requestable applications
• Submit access requests with justification
• Track request status
• View approval workflows

Would you like to see available applications?`;
    }

    return `**Okta Assistant**

I can help you with:

• **Access Reviews**: Review your application access
• **Governance**: Manage access campaigns (admin users)  
• **Access Requests**: Request new application access
• **Compliance**: Ensure proper access management

${context ? `\n**Access Level**: ${context.split('Access Level: ')[1]?.split('\n')[0] || 'Standard'}` : ''}

What would you like to do?`;
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
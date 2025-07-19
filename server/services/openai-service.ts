import OpenAI from "openai";

export class OpenAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    try {
      console.log('🤖 Generating ChatGPT response for prompt:', prompt.substring(0, 100) + '...');
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `You are an expert Okta Assistant helping enterprise users with identity and access management. You have deep knowledge of:

- Okta administration and user management
- Access request processes and application catalog
- Governance, compliance, and access reviews
- Privileged Access Management (PAM)
- Enterprise security best practices

Respond conversationally and helpfully. Keep responses concise but informative. Focus on actionable guidance rather than theoretical explanations.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";
      console.log('✅ ChatGPT response generated successfully');
      return response;
      
    } catch (error) {
      console.error('❌ OpenAI API error:', error);
      
      // Provide a helpful fallback response
      return this.getFallbackResponse(prompt);
    }
  }

  private getFallbackResponse(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('access request') || lowerPrompt.includes('request access')) {
      return `I can help you with access requests! Here's how to request application access:

**Step 1**: Browse available applications in your Okta dashboard
**Step 2**: Click on the application you need access to
**Step 3**: If prompted, provide business justification
**Step 4**: Submit the request for manager approval

Would you like me to help you find a specific application or guide you through the request process?`;
    }
    
    if (lowerPrompt.includes('governance') || lowerPrompt.includes('campaign')) {
      return `I can help you with governance campaigns and compliance tasks:

• **Access Reviews**: Set up automated reviews for user access
• **Compliance Reports**: Generate audit reports for access management
• **Campaign Creation**: Design governance workflows
• **Risk Assessment**: Identify over-privileged users

What type of governance task would you like help with?`;
    }
    
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.includes('hey')) {
      return `Hello! I'm your Okta Assistant. I can help you with identity and access management tasks including access requests, user management, and governance workflows.

What can I help you with today?`;
    }
    
    return `I'm here to help with your Okta identity and access management needs. I can assist with:

• Access requests and application management
• User and group administration
• Governance and compliance tasks
• Security best practices

What specific task can I help you with?`;
  }
}
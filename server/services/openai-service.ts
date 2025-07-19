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

Based on the user's role, provide appropriate responses:
- SUPER ADMIN / ORG ADMIN: Full administrative capabilities, governance workflows, user management, advanced operations
- APP OWNER / APP ADMIN: Application management, user assignments, moderate admin tasks
- REGULAR USER: Basic access requests, self-service tasks, application usage

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
      return `As an admin, you can both submit and manage access requests:

**For Submitting Requests:**
• Browse application catalog and request access for yourself
• Submit requests with business justification

**For Managing Requests (Admin Powers):**
• **Review & Approve**: Pending access requests from users
• **Bulk Operations**: Mass approve/deny requests  
• **Policy Setup**: Configure auto-approval rules
• **Audit Trail**: View request history and compliance reports
• **User Assignment**: Directly assign applications to users

**Available Resources:**
• Application Catalog API integration
• Automated workflow triggers
• Compliance reporting tools

Would you like to manage pending requests, set up policies, or submit a personal request?`;
    }
    
    if (lowerPrompt.includes('governance') || lowerPrompt.includes('campaign')) {
      return `I can help you with governance campaigns and compliance tasks:

• **Access Reviews**: Set up automated reviews for user access
• **Compliance Reports**: Generate audit reports for access management
• **Campaign Creation**: Design governance workflows
• **Risk Assessment**: Identify over-privileged users
• **Bulk Operations**: Mass user updates and group management
• **Policy Enforcement**: Configure access policies and rules

As an admin, you have access to advanced governance tools. What type of governance task would you like help with?`;
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
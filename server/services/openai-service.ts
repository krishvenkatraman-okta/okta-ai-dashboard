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
            content: `You are an expert Okta Assistant that can actually perform tasks, not just provide guidance. You have access to:

- Okta Governance API for catalog browsing and access requests
- Real application catalog with role-based access
- Ability to submit actual access requests with justification
- User request management and tracking

When users ask about access requests or applications:
1. ACTUALLY fetch and show available catalog entries
2. Display specific roles/permissions for each application  
3. Guide users through real access request submission
4. Show request status and tracking information

Available actions you can perform:
- "show catalog" - fetch and display available applications
- "show [app name] roles" - display available roles for specific app
- "request access to [app]" - start access request process
- "show my requests" - display current request status

Based on the user's role:
- SUPER ADMIN: Can browse full catalog, submit requests, and manage others' requests
- APP OWNER: Can manage assigned applications and submit requests
- REGULAR USER: Can browse catalog and submit access requests

Always try to perform the actual task rather than just explaining how to do it. Use the governance API to provide real, current data.`
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.3,
        functions: [
          {
            name: "fetch_catalog",
            description: "Fetch available applications from Okta catalog",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          },
          {
            name: "fetch_app_details",
            description: "Get details and available roles for a specific application",
            parameters: {
              type: "object",
              properties: {
                entryId: {
                  type: "string",
                  description: "The catalog entry ID of the application"
                }
              },
              required: ["entryId"]
            }
          },
          {
            name: "submit_access_request",
            description: "Submit an access request for an application",
            parameters: {
              type: "object",
              properties: {
                catalogId: {
                  type: "string",
                  description: "The catalog entry ID"
                },
                roleId: {
                  type: "string", 
                  description: "The role ID to request (optional)"
                },
                justification: {
                  type: "string",
                  description: "Business justification for the request"
                },
                duration: {
                  type: "string",
                  description: "Duration amount (optional)"
                },
                durationUnit: {
                  type: "string",
                  enum: ["hours", "days", "weeks"],
                  description: "Duration unit (optional)"
                }
              },
              required: ["catalogId", "justification"]
            }
          },
          {
            name: "fetch_owned_apps",
            description: "Fetch applications owned by the current user (app owners only)",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          },
          {
            name: "create_governance_campaign",
            description: "Create a governance campaign for access reviews (app owners only)",
            parameters: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Campaign name"
                },
                description: {
                  type: "string",
                  description: "Campaign description"
                },
                applicationIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of application IDs to review"
                },
                duration: {
                  type: "number",
                  description: "Review duration in days"
                }
              },
              required: ["name", "applicationIds"]
            }
          },
          {
            name: "fetch_30_day_review",
            description: "Fetch applications not accessed in the last 30 days for cleanup review",
            parameters: {
              type: "object",
              properties: {},
              required: []
            }
          },
          {
            name: "revoke_access",
            description: "Revoke access to an application",
            parameters: {
              type: "object",
              properties: {
                applicationId: {
                  type: "string",
                  description: "The application ID to revoke access from"
                }
              },
              required: ["applicationId"]
            }
          }
        ]
      });

      const response = completion.choices[0]?.message;
      
      // Check if ChatGPT wants to call a function
      if (response?.function_call) {
        console.log('🔧 ChatGPT requesting function call:', response.function_call.name);
        
        // Return a structured response indicating function call needed
        return JSON.stringify({
          type: 'function_call',
          function: response.function_call.name,
          arguments: JSON.parse(response.function_call.arguments || '{}'),
          message: `Let me ${response.function_call.name.replace('_', ' ')} for you...`
        });
      }

      const content = response?.content || "I apologize, but I couldn't generate a response. Please try again.";
      console.log('✅ ChatGPT response generated successfully');
      return content;
      
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
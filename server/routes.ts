import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { OktaAuthService } from "./services/okta-auth";
import { McpServerService } from "./services/mcp-server";
import { OktaApiService } from "./services/okta-api";
import { insertChatMessageSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const oktaAuth = new OktaAuthService();
  const mcpServer = new McpServerService();
  const oktaApi = new OktaApiService();

  // Authentication routes
  app.get('/api/auth/login', (req, res) => {
    const authUrl = oktaAuth.getAuthUrl();
    res.redirect(authUrl);
  });

  app.get('/api/auth/callback', async (req, res) => {
    try {
      console.log('🔄 Auth callback received:');
      console.log('  Query params:', req.query);
      console.log('  URL:', req.url);
      console.log('  Headers:', JSON.stringify(req.headers, null, 2));
      
      const { code, state, error, error_description } = req.query;
      
      // Check for OAuth error
      if (error) {
        console.error('OAuth error:', error, error_description);
        return res.status(400).json({ 
          error: 'OAuth error', 
          details: error_description || error 
        });
      }
      
      if (!code || typeof code !== 'string') {
        console.error('Missing or invalid authorization code:', code);
        return res.status(400).json({ error: 'Missing authorization code' });
      }
      
      if (!state || typeof state !== 'string') {
        return res.status(400).json({ error: 'Missing state parameter' });
      }

      const tokens = await oktaAuth.exchangeCode(code, state);
      const oktaUser = await oktaAuth.getUserInfo(tokens.accessToken);
      
      // Get or create user
      let user = await storage.getUserByOktaId(oktaUser.id);
      if (!user) {
        const userRole = oktaAuth.determineUserRole(oktaUser.groups || []);
        user = await storage.createUser({
          oktaId: oktaUser.id,
          username: oktaUser.profile.login,
          email: oktaUser.profile.email,
          name: `${oktaUser.profile.firstName} ${oktaUser.profile.lastName}`,
          role: userRole,
          groups: oktaUser.groups || []
        });
      } else {
        // Update last login AND refresh role from current Okta groups/roles
        console.log('🔄 Updating existing user:', user.name);
        console.log('🔄 Current user role:', user.role);
        console.log('🔄 Fetched Okta groups:', oktaUser.groups);
        
        const userRole = oktaAuth.determineUserRole(oktaUser.groups || []);
        console.log('🔄 Determined new role:', userRole);
        
        await storage.updateUser(user.id, { 
          lastLogin: new Date(),
          role: userRole,
          groups: oktaUser.groups || []
        });
        user.role = userRole; // Update in-memory user object
        user.groups = oktaUser.groups || [];
        
        console.log('✅ Updated user role in database to:', userRole);
      }

      // Create session
      const sessionId = oktaAuth.generateSessionId();
      await storage.createSession({
        sessionId,
        userId: user.id,
        oktaTokens: {
          accessToken: tokens.accessToken,
          idToken: tokens.idToken,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + tokens.expiresIn * 1000
        },
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000)
      });

      // Set session cookie
      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expiresIn * 1000,
        path: '/'
      });

      console.log('✅ Session created:', {
        sessionId: sessionId.substring(0, 8) + '...',
        userId: user.id,
        userName: user.name
      });

      res.redirect('/dashboard');
    } catch (error) {
      console.error('Auth callback error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  app.get('/api/auth/status', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      console.log('🔍 Auth status check:', {
        hasSessionId: !!sessionId,
        sessionId: sessionId?.substring(0, 8) + '...' || 'none',
        cookies: Object.keys(req.cookies)
      });

      if (!sessionId) {
        return res.json({ authenticated: false, reason: 'no_session_cookie' });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.json({ authenticated: false, reason: 'session_not_found' });
      }

      if (session.expiresAt < new Date()) {
        return res.json({ authenticated: false, reason: 'session_expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.json({ authenticated: false, reason: 'user_not_found' });
      }

      console.log('✅ Auth status success:', user.name);
      res.json({ authenticated: true, user });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false, reason: 'server_error' });
    }
  });

  app.get('/api/auth/user', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      console.log('🔍 User fetch:', {
        hasSessionId: !!sessionId,
        sessionId: sessionId?.substring(0, 8) + '...' || 'none'
      });

      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      console.log('✅ User fetch success:', user.name);
      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (sessionId) {
        await storage.deleteSession(sessionId);
      }
      res.clearCookie('session_id');
      res.json({ success: true });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // Force refresh user role from Okta
  app.post('/api/auth/refresh-role', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      console.log('🔄 Force refreshing role for user:', user.name);

      // Get fresh user info from Okta
      const oktaUser = await oktaAuth.getUserInfo(session.oktaTokens.accessToken);
      console.log('🔄 Fetched fresh Okta groups:', oktaUser.groups);
      
      // Determine new role
      const newRole = oktaAuth.determineUserRole(oktaUser.groups || []);
      console.log('🔄 Determined role:', newRole);
      
      // Update user in database
      await storage.updateUser(user.id, {
        role: newRole,
        groups: oktaUser.groups || [],
        lastLogin: new Date()
      });

      // Return updated user
      const updatedUser = await storage.getUser(session.userId);
      console.log('✅ Role refresh complete:', updatedUser?.role);
      
      res.json({ 
        success: true, 
        user: updatedUser,
        oldRole: user.role,
        newRole: newRole
      });
    } catch (error) {
      console.error('Role refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh role' });
    }
  });

  // Governance API routes
  app.get('/api/governance/catalog', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const catalogEntries = await governanceService.getCatalogEntries(session.oktaTokens.accessToken);
      res.json(catalogEntries);
    } catch (error) {
      console.error('Catalog fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch catalog' });
    }
  });

  app.get('/api/governance/catalog/:entryId', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const entryDetails = await governanceService.getCatalogEntryDetails(req.params.entryId, session.oktaTokens.accessToken);
      res.json(entryDetails);
    } catch (error) {
      console.error('Catalog entry fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch catalog entry details' });
    }
  });

  app.post('/api/governance/request', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const { catalogId, roleId, justification, duration, durationUnit } = req.body;
      
      if (!catalogId || !justification) {
        return res.status(400).json({ error: 'catalogId and justification are required' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const requestResponse = await governanceService.submitAccessRequest(
        { catalogId, roleId, justification, duration, durationUnit },
        session.oktaTokens.accessToken
      );
      
      res.json(requestResponse);
    } catch (error) {
      console.error('Access request error:', error);
      res.status(500).json({ error: 'Failed to submit access request' });
    }
  });

  app.get('/api/governance/my-requests', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const requests = await governanceService.getMyRequests(session.oktaTokens.accessToken);
      res.json(requests);
    } catch (error) {
      console.error('My requests fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch requests' });
    }
  });

  app.get('/api/governance/owned-apps', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user || (user.role !== 'app_owner' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'App owner access required' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const ownedApps = await governanceService.getOwnedApplications(user.oktaId, session.oktaTokens.accessToken);
      res.json(ownedApps);
    } catch (error) {
      console.error('Owned apps fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch owned applications' });
    }
  });

  app.post('/api/governance/campaign', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user || (user.role !== 'app_owner' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'App owner access required' });
      }

      const { name, description, applicationIds, reviewers, duration, durationUnit } = req.body;
      
      if (!name || !applicationIds?.length) {
        return res.status(400).json({ error: 'name and applicationIds are required' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const campaign = await governanceService.createGovernanceCampaign({
        id: '',
        name,
        description: description || `Access review campaign for ${applicationIds.length} applications`,
        applicationIds,
        reviewers: reviewers || [user.email],
        duration: duration || 14,
        durationUnit: durationUnit || 'days'
      }, session.oktaTokens.accessToken);
      
      res.json(campaign);
    } catch (error) {
      console.error('Campaign creation error:', error);
      res.status(500).json({ error: 'Failed to create governance campaign' });
    }
  });

  app.get('/api/governance/30-day-review', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const unusedAccess = await governanceService.getUserApplicationAccess(user.oktaId, session.oktaTokens.accessToken);
      res.json(unusedAccess);
    } catch (error) {
      console.error('30-day review error:', error);
      res.status(500).json({ error: 'Failed to fetch 30-day access review' });
    }
  });

  app.post('/api/governance/revoke-access', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { applicationId } = req.body;
      if (!applicationId) {
        return res.status(400).json({ error: 'applicationId is required' });
      }

      const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
      const governanceService = new OktaGovernanceService();
      
      const result = await governanceService.revokeUserAccess(user.oktaId, applicationId, session.oktaTokens.accessToken);
      res.json(result);
    } catch (error) {
      console.error('Access revocation error:', error);
      res.status(500).json({ error: 'Failed to revoke access' });
    }
  });

  // Chat routes
  app.post('/api/chat/message', async (req, res) => {
    try {
      console.log('💬 Chat request received');
      console.log('Cookies:', req.cookies);
      
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        console.log('❌ No session ID found in cookies');
        return res.status(401).json({ error: 'Not authenticated - no session cookie' });
      }

      console.log('🔍 Session ID found:', sessionId.substring(0, 8) + '...');

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Save user message
      await storage.createChatMessage({
        userId: user.id,
        message,
        messageType: 'user'
      });

      // Import Ollama service instead of OpenAI due to quota issues
      const { OllamaService } = await import('./services/ollama-service.ts');
      const ollamaService = new OllamaService();

      // Create contextual prompt for natural language processing
      let contextualPrompt = `You are an expert Okta Assistant helping ${user.name} with role: ${user.role}.

User asks: "${message}"

Instructions:
- Respond conversationally and helpfully
- For "access request": Guide them through requesting application access (NOT governance campaigns)
- For "governance/campaigns": Help with compliance and access reviews
- For general questions: Provide relevant Okta administration help
- Role level: ${user.role === 'super_admin' ? 'Full admin access' : user.role === 'app_owner' ? 'App management access' : 'Standard user access'}

Response (be natural and concise):`;

      // Try MCP server approach first for intelligent API handling
      const { OktaMCPServer } = await import('./services/okta-mcp-server.ts');
      const mcpServer = new OktaMCPServer();
      
      console.log('🤖 Attempting MCP processing for:', message);
      const mcpResult = await mcpServer.processRequest(message, {
        accessToken: session.oktaTokens.accessToken,
        userId: user.oktaId,
        userRole: user.role
      });

      let finalResponse = '';
      
      if (mcpResult.success) {
        console.log('✅ MCP handled request successfully:', mcpResult.type);
        
        // Store interaction ID for potential feedback
        res.cookie('last_interaction_id', mcpResult.interactionId, { 
          httpOnly: false, 
          maxAge: 10 * 60 * 1000 // 10 minutes
        });
        
        // Format MCP results into user-friendly responses
        switch (mcpResult.type) {
          case 'catalog':
            const catalogData = mcpResult.data;
            console.log('🎯 Catalog data received in routes:', catalogData?.length, 'entries');
            
            if (catalogData && catalogData.length > 0) {
              const requestableApps = catalogData.filter((app: any) => app.requestable !== false);
              finalResponse = `**🏪 Real Okta IGA Catalog - AI Enhanced**\n\n✅ **Found ${catalogData.length} applications (${requestableApps.length} requestable):**\n\n${
                catalogData.slice(0, 15).map((entry: any, index: number) => 
                  `${index + 1}. **${entry.displayName || entry.name || 'Unknown App'}**\n   ${entry.requestable === false ? '🔒 Not Requestable' : '✅ Available for Request'}\n   Type: ${entry.type || 'Application'}${entry.description ? `\n   Description: ${entry.description}` : ''}`
                ).join('\n\n')
              }${catalogData.length > 15 ? `\n\n... and ${catalogData.length - 15} more applications` : ''}\n\n**Next Steps:**\n• Say "request access to [app name]" to submit a request\n• All applications above are from your real Okta IGA catalog\n\n*📊 AI successfully retrieved your actual catalog via intelligent API mapping*\n\n**Feedback:** 👍 👎 (Rate this response)`;
            } else {
              finalResponse = `**📋 Empty Catalog**\n\nThe IGA catalog API returned no applications. This may indicate:\n• No apps are published to the catalog\n• Access permissions need configuration\n• IGA may not be fully enabled\n\nContact your Okta administrator for catalog setup.`;
            }
            break;

          case '30_day_review':
            // Use the processed message from MCP server
            finalResponse = mcpResult.message || `**📊 30-Day Access Review - AI Enhanced**\n\n✅ Retrieved system logs via intelligent API mapping.\n\nAnalyzing authentication patterns...\n\n*📊 AI continuously learns from usage patterns*\n\n**Feedback:** 👍 👎 (Help AI improve accuracy)`;
            break;

          case 'access_request_submitted':
            const requestData = mcpResult.data;
            finalResponse = `**✅ Access Request Submitted**\n\nRequest ID: ${requestData.id || 'Generated'}\nStatus: ${requestData.status || 'Pending'}\nSubmitted: ${new Date().toISOString()}\n\n*🤖 AI successfully mapped your request to the correct API*\n\n**Feedback:** 👍 👎 (Rate this response)`;
            break;

          default:
            finalResponse = `**🤖 AI Request Processed**\n\n${mcpResult.message}\n\nThe system used intelligent API mapping to handle your request.\n\n**Feedback:** 👍 👎 (Help AI learn)`;
        }
      } else {
        console.log('⚠️ MCP failed, falling back to function detection');
        
        // Fallback to existing function detection
        const functionCall = await ollamaService.detectFunction(message, user.role);
        
        if (functionCall) {
          console.log('🎯 Fallback function call:', functionCall.function);
          finalResponse = `**🔄 Fallback Mode**\n\nMCP failed, using basic function detection for: ${functionCall.function}`;
        } else {
          finalResponse = await ollamaService.generateResponse(contextualPrompt, user.role);
        }
      }

      // Legacy function call support (for complex operations)
      try {
        const parsedResponse = JSON.parse(finalResponse);
        if (parsedResponse.type === 'function_call') {
          console.log('🔧 Executing legacy function:', parsedResponse.function);
          
          const { OktaGovernanceService } = await import('./services/okta-governance-api.ts');
          const legacyGovernanceService = new OktaGovernanceService();
          
          switch (parsedResponse.function) {
            case 'fetch_app_details':
              const entryDetails = await legacyGovernanceService.getCatalogEntryDetails(
                parsedResponse.arguments.entryId, 
                session.oktaTokens.accessToken
              );
              finalResponse = `**${entryDetails.displayName}** - Available Access Levels:\n\n${
                entryDetails.availableRoles?.map((role, index) => 
                  `${index + 1}. **${role.displayName}**\n   ID: ${role.id}\n   ${role.description ? `Description: ${role.description}` : ''}`
                ).join('\n\n') || 'No specific roles available - you can request general access.'
              }\n\nTo request access, say "request access to ${entryDetails.displayName}" and I'll guide you through the process.`;
              break;
              
            case 'submit_access_request':
              const requestResult = await legacyGovernanceService.submitAccessRequest(
                parsedResponse.arguments,
                session.oktaTokens.accessToken
              );
              finalResponse = `✅ **Access Request Submitted Successfully!**\n\nRequest ID: ${requestResult.id}\nApplication: ${requestResult.catalogEntryDisplayName}\nStatus: ${requestResult.status}\nSubmitted: ${requestResult.requestedOn}\n\nYour request has been submitted for approval. You'll be notified when it's processed.`;
              break;
              
            case 'create_governance_campaign':
              const campaign = await legacyGovernanceService.createGovernanceCampaign({
                id: '',
                ...parsedResponse.arguments,
                reviewers: [user.email],
                durationUnit: 'days' as const
              }, session.oktaTokens.accessToken);
              finalResponse = `✅ **Governance Campaign Created Successfully!**\n\nCampaign ID: ${campaign.id}\nStatus: ${campaign.status}\nName: ${parsedResponse.arguments.name}\nApplications: ${parsedResponse.arguments.applicationIds?.length || 0} apps\nDuration: ${parsedResponse.arguments.duration || 14} days\n\nThe access review campaign has been started. Reviewers will be notified to review user access for the selected applications.`;
              break;
              
            case 'revoke_access':
              const revokeResult = await legacyGovernanceService.revokeUserAccess(user.oktaId, parsedResponse.arguments.applicationId, session.oktaTokens.accessToken);
              finalResponse = `✅ **Access Revoked Successfully!**\n\nApplication ID: ${parsedResponse.arguments.applicationId}\nStatus: ${revokeResult.success ? 'Revoked' : 'Failed'}\n\nYour access to this application has been removed. This helps maintain security compliance and reduces your attack surface.`;
              break;
              
            default:
              // Keep original AI response if no function match
              break;
          }
        }
      } catch (e) {
        // Not a function call, keep the response as is
      }

      // Save assistant response
      await storage.createChatMessage({
        userId: user.id,
        message: finalResponse,
        response: JSON.stringify({ response: finalResponse, source: 'openai' }),
        messageType: 'assistant',
        command: 'chat'
      });

      res.json({ response: finalResponse });
    } catch (error) {
      console.error('Chat message error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  // Okta API routes
  app.get('/api/okta/user-apps', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      console.log('🔍 Fetching user apps for:', user.name);

      // Import Okta API service
      const { OktaApiService } = await import('./services/okta-api.ts');
      const oktaApi = new OktaApiService();

      // Try to get user's appLinks first (these have proper launch URLs)
      let apps = await oktaApi.getUserAppLinks(session.oktaTokens.accessToken);
      
      if (apps.length === 0) {
        console.log('No appLinks found, trying getUserApplications...');
        apps = await oktaApi.getUserApplications(user.oktaId, session.oktaTokens.accessToken);
      }
      
      console.log(`✅ Found ${apps.length} applications for user`);
      console.log('📱 Sample app data:', JSON.stringify(apps.slice(0, 1), null, 2));
      res.json(apps);
    } catch (error) {
      console.error('Failed to fetch user apps:', error);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  app.get('/api/okta/dashboard-stats', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const stats = await oktaApi.getDashboardStats(session.oktaTokens.accessToken);
      res.json(stats);
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // User app links API endpoint (Okta end-user dashboard)
  app.get('/api/user/applinks', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Get user's app links from Okta - exactly what end user dashboard shows
      const appLinks = await oktaApi.getUserAppLinks(session.oktaTokens.accessToken);
      res.json(appLinks);
    } catch (error) {
      console.error('Get user app links error:', error);
      res.status(500).json({ error: 'Failed to fetch user app links' });
    }
  });

  // Applications API endpoint (for admin purposes)
  app.get('/api/applications', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Get applications using user's access token for proper permissions
      const apps = await oktaApi.getApplications(session.oktaTokens.accessToken);
      res.json(apps);
    } catch (error) {
      console.error('Get applications error:', error);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  // Governance API endpoints
  app.get('/api/governance/apps', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Get governance-enabled applications using MCP server
      const mcpResponse = await mcpServer.processMessage('list governance enabled applications', user, session.oktaTokens);
      res.json(mcpResponse.success ? mcpResponse.data : []);
    } catch (error) {
      console.error('Get governance apps error:', error);
      res.status(500).json({ error: 'Failed to fetch governance applications' });
    }
  });

  // Access request catalog endpoint
  app.get('/api/catalog/entries', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Get catalog entries using MCP server
      const mcpResponse = await mcpServer.processMessage('list catalog entries for access requests', user, session.oktaTokens);
      res.json(mcpResponse.success ? mcpResponse.data : []);
    } catch (error) {
      console.error('Get catalog entries error:', error);
      res.status(500).json({ error: 'Failed to fetch catalog entries' });
    }
  });

  // Submit access request endpoint
  app.post('/api/requests/submit', async (req, res) => {
    try {
      const sessionId = req.cookies.session_id;
      if (!sessionId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const { entryId, justification } = req.body;
      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      // Submit access request using MCP server
      const mcpResponse = await mcpServer.processMessage(
        `submit access request for entry ${entryId} with justification: ${justification}`, 
        user, 
        session.oktaTokens
      );
      
      if (mcpResponse.success) {
        res.json(mcpResponse.data);
      } else {
        res.status(400).json({ error: mcpResponse.error });
      }
    } catch (error) {
      console.error('Submit access request error:', error);
      res.status(500).json({ error: 'Failed to submit access request' });
    }
  });

  // Feedback route for continuous learning
  app.post('/api/chat/feedback', async (req, res) => {
    try {
      const { interactionId, feedback, correctIntent } = req.body;

      if (!interactionId || !feedback) {
        return res.status(400).json({ error: 'Missing required feedback parameters' });
      }

      console.log(`💬 Received feedback: ${feedback} for interaction ${interactionId}`);

      // Get MCP server instance and record feedback
      const { OktaMCPServer } = await import('./services/okta-mcp-server.ts');
      const mcpServer = new OktaMCPServer();
      
      await mcpServer.recordFeedback(interactionId, feedback, correctIntent);

      res.json({ 
        success: true, 
        message: `Feedback recorded: ${feedback}`,
        learningEnabled: true
      });

    } catch (error) {
      console.error('Feedback recording error:', error);
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  // Training statistics route
  app.get('/api/chat/training-stats', async (req, res) => {
    try {
      const { OktaMCPServer } = await import('./services/okta-mcp-server.ts');
      const mcpServer = new OktaMCPServer();
      
      const stats = mcpServer.getTrainingStats();
      res.json(stats);

    } catch (error) {
      console.error('Training stats error:', error);
      res.status(500).json({ error: 'Failed to get training statistics' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

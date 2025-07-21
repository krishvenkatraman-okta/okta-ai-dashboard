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
  const mcpServer = new McpServerService(oktaAuth); // Inject auth service
  const oktaApi = new OktaApiService();

  // Authentication routes
  app.get('/api/auth/login', (req, res) => {
    const authUrl = oktaAuth.getAuthUrl();
    res.redirect(authUrl);
  });

  // Admin session route
  app.get('/api/auth/admin-login', (req, res) => {
    if (!(req as any).session?.userId) {
      return res.status(401).json({ error: 'Must be logged in to access admin session' });
    }
    
    const adminUrl = oktaAuth.getAdminDashboardUrl();
    res.json({ 
      adminUrl,
      message: 'Please complete admin authentication in the popup window'
    });
  });

  // Store admin session token (called from frontend after admin auth)
  app.post('/api/auth/admin-session', (req, res) => {
    if (!(req as any).session?.userId) {
      return res.status(401).json({ error: 'Must be logged in' });
    }

    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token required' });
    }

    // Store session token with 1 hour expiry
    const expiresAt = Date.now() + (60 * 60 * 1000);
    oktaAuth.storeAdminSessionToken((req as any).session.userId, sessionToken, expiresAt);
    
    res.json({ success: true, message: 'Admin session established' });
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
        const allRoles = await oktaAuth.getAllUserRoles(oktaUser.id, oktaUser.groups || []);
        user = await storage.createUser({
          oktaId: oktaUser.id,
          username: oktaUser.profile.login,
          email: oktaUser.profile.email,
          name: `${oktaUser.profile.firstName} ${oktaUser.profile.lastName}`,
          role: userRole,
          allRoles: allRoles,
          groups: oktaUser.groups || []
        });
      } else {
        // Update last login AND refresh role from current Okta groups/roles
        console.log('🔄 Updating existing user:', user.name);
        console.log('🔄 Current user role:', user.role);
        console.log('🔄 Fetched Okta groups:', oktaUser.groups);
        
        const userRole = oktaAuth.determineUserRole(oktaUser.groups || []);
        const allRoles = await oktaAuth.getAllUserRoles(oktaUser.id, oktaUser.groups || []);
        console.log('🔄 Determined new role:', userRole);
        console.log('🔄 All roles:', allRoles);
        
        await storage.updateUser(user.id, { 
          lastLogin: new Date(),
          role: userRole,
          allRoles: allRoles,
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
      
      // Update user in database with fresh role information including custom roles
      const allRoles = await oktaAuth.getAllUserRoles(user.oktaId, oktaUser.groups || []);
      await storage.updateUser(user.id, {
        role: newRole,
        allRoles: allRoles,
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

      // Use enhanced LLM automation service for intelligent API handling
      const { LLMAutomationService } = await import('./services/llm-automation.ts');
      const { OktaAuthService } = await import('./services/okta-auth.ts');
      const authService = new OktaAuthService();
      const llmService = new LLMAutomationService(authService);
      
      console.log('🤖 Using enhanced LLM processing for:', message);
      
      const llmResult = await llmService.processGovernanceRequest(message, user, session.oktaTokens);

      let finalResponse = '';
      
      if (llmResult.success) {
        console.log('✅ LLM handled request successfully');
        
        // LLM service returns formatted responses
        finalResponse = llmResult.data?.response || 'Request processed successfully';
        
        // Handle special response types
        if (llmResult.requiresAdminAuth) {
          // Add admin session requirement handling
          finalResponse += '\n\n🔐 **Admin authentication required**\n\nClick "Establish Admin Session" to continue with administrative operations.';
        }
      } else {
        console.log('❌ LLM processing failed, using intelligent fallback');
        // Use intelligent fallback response
        finalResponse = `I understand you're asking about "${message}". However, I'm currently experiencing some technical difficulties with my processing. 

Please try rephrasing your request or use one of these specific commands:
• "request [application name]" - to request access to applications
• "show my groups" - to view your group management access
• "list available applications" - to see available apps
• "30-day access review" - to review recent access

You can also refresh the page and try again.`;
      }

      // Save assistant response
      await storage.createChatMessage({
        userId: user.id,
        message: finalResponse,
        response: JSON.stringify({ response: finalResponse, source: 'llm_automation' }),
        messageType: 'assistant',
        command: 'chat'
      });

      res.json({ response: finalResponse });
    } catch (error) {
      console.error('💥 Chat message error:', error);
      console.error('💥 Stack trace:', (error as Error).stack);
      res.status(500).json({ error: `Failed to process message: ${(error as Error).message}` });
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

  return app;
}

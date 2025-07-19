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
        // Update last login
        await storage.updateUser(user.id, { lastLogin: new Date() });
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

  // Chat routes
  app.post('/api/chat/message', async (req, res) => {
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

      // Import local services
      const { LocalOllamaService } = await import('./services/local-ollama.ts');
      const ollamaService = new LocalOllamaService();

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

      const aiResponse = await ollamaService.generateResponse(contextualPrompt);

      // Save assistant response
      await storage.createChatMessage({
        userId: user.id,
        message: aiResponse,
        response: JSON.stringify({ response: aiResponse, source: 'ollama' }),
        messageType: 'assistant',
        command: 'chat'
      });

      res.json({ response: aiResponse });
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

  const httpServer = createServer(app);
  return httpServer;
}

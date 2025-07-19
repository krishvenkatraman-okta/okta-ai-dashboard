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
        maxAge: tokens.expiresIn * 1000
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
      if (!sessionId) {
        return res.json({ authenticated: false });
      }

      const session = await storage.getSession(sessionId);
      if (!session || session.expiresAt < new Date()) {
        return res.json({ authenticated: false });
      }

      const user = await storage.getUser(session.userId);
      if (!user) {
        return res.json({ authenticated: false });
      }

      res.json({ authenticated: true, user });
    } catch (error) {
      console.error('Auth status error:', error);
      res.json({ authenticated: false });
    }
  });

  app.get('/api/auth/user', async (req, res) => {
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

      // Process message through MCP server
      const mcpResponse = await mcpServer.processMessage(message, user, {
        accessToken: session.oktaTokens.accessToken,
        idToken: session.oktaTokens.idToken,
        refreshToken: session.oktaTokens.refreshToken,
        expiresIn: Math.floor((session.oktaTokens.expiresAt - Date.now()) / 1000)
      });

      // Save assistant response
      await storage.createChatMessage({
        userId: user.id,
        message: mcpResponse.data?.response || 'I processed your request.',
        response: JSON.stringify(mcpResponse),
        messageType: 'assistant',
        command: mcpResponse.toolName
      });

      res.json(mcpResponse);
    } catch (error) {
      console.error('Chat message error:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  // Okta API routes
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

  const httpServer = createServer(app);
  return httpServer;
}

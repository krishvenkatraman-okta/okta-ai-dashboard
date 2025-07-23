import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { OktaAuthService } from "./services/okta-auth";
import { McpServerService } from "./services/mcp-server";
import { OktaApiService } from "./services/okta-api";
import { gamificationService } from "./services/simple-gamification.js";
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

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('session_id');
    res.json({ success: true });
  });

  // Debug endpoint to check recent auth activity
  app.get('/api/debug/auth-logs', (req, res) => {
    // Simple debug info about recent auth activity
    res.json({
      message: 'To test Fastpass, please ensure you are logged in first',
      instructions: [
        '1. Click "Sign Out" if you see it in the dashboard',
        '2. Go to home page and click "Login with Okta"', 
        '3. Complete authentication',
        '4. Check for automatic Fastpass message in AI Assistant',
        '5. Or use the "Test Fastpass" button in dashboard header'
      ],
      currentStatus: 'Not authenticated - please log in to test Fastpass'
    });
  });

  // Manual Fastpass test endpoint for debugging
  app.post('/api/fastpass/test', async (req, res) => {
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

      console.log('🔒 Manual Fastpass test triggered for user:', user.oktaId);
      
      // Check user's authenticators using their access token
      console.log('🔍 Making manual test API call with token:', session.oktaTokens.accessToken.substring(0, 20) + '...');
      const authResponse = await fetch(`https://fcxdemo.okta.com/api/v1/users/me/factors`, {
        headers: {
          'Authorization': `Bearer ${session.oktaTokens.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('🔍 Manual test API response status:', authResponse.status);

      if (authResponse.ok) {
        const authenticators = await authResponse.json();
        console.log('🔍 Retrieved authenticators for manual test:', authenticators);
        
        // Look for Okta Verify enrollment
        const oktaVerifyEnrolled = authenticators.some((auth: any) => 
          auth.name === 'Okta Verify' && 
          auth.enrollments && 
          auth.enrollments.length > 0
        );

        const userStats = await gamificationService.getUserStats(user.oktaId);
        const isFirstTimeVerification = !userStats.fastpassVerified;

        if (oktaVerifyEnrolled) {
          const gamificationResult = await gamificationService.recordFastpassVerification(
            user.oktaId, 
            isFirstTimeVerification
          );

          res.json({
            success: true,
            enrolled: true,
            isFirstTime: isFirstTimeVerification,
            gamification: gamificationResult,
            message: isFirstTimeVerification ? 'Great job on fastpass enrollment! Points and badge earned.' : 'You are secured with Fastpass enrollment.'
          });
        } else {
          res.json({
            success: true,
            enrolled: false,
            message: 'Fastpass (Okta Verify) not enrolled. Please enroll to enhance security and earn rewards!'
          });
        }
      } else {
        console.log('⚠️ Failed to check authenticators:', authResponse.status);
        res.status(400).json({ error: 'Failed to check Fastpass enrollment' });
      }
    } catch (error) {
      console.error('❌ Manual Fastpass test error:', error);
      res.status(500).json({ error: 'Fastpass test failed' });
    }
  });

  // Admin session route - simple redirect to admin dashboard
  app.post('/api/auth/admin-login', (req, res) => {
    const sessionId = req.cookies.session_id;
    if (!sessionId) {
      return res.status(401).json({ error: 'Must be logged in to access admin session' });
    }
    
    // Just provide the admin dashboard URL - no complex OAuth needed
    const adminAuthUrl = oktaAuth.getAdminAuthUrl('');
    
    res.json({ 
      adminAuthUrl,
      message: 'Admin dashboard URL ready - authenticate there and return'
    });
  });

  // Admin session confirmation - user returns from admin dashboard
  app.post('/api/auth/admin-confirm', async (req, res) => {
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

      // Mark admin session as active (simple in-memory flag)
      const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
      oktaAuth.setAdminSessionToken(user.oktaId, 'admin_session_active');

      console.log('✅ Admin session confirmed for user:', user.name);
      res.json({ 
        success: true,
        message: 'Admin session established',
        expiresIn: 3600
      });
    } catch (error) {
      console.error('Admin confirm error:', error);
      res.status(500).json({ error: 'Failed to confirm admin session' });
    }
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

      // Perform automatic Fastpass enrollment check on login
      try {
        console.log('🔒 Performing automatic Fastpass enrollment check for user:', user.oktaId);
        console.log('🔒 User details for Fastpass check:', { userId: user.id, oktaId: user.oktaId, name: user.name });
        
        // Check user's authenticators using their access token
        console.log('🔍 Making authenticator API call with token:', tokens.accessToken.substring(0, 20) + '...');
        const authResponse = await fetch(`https://fcxdemo.okta.com/api/v1/users/me/factors`, {
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        console.log('🔍 Authenticator API response status:', authResponse.status);
        
        let authenticators;
        
        if (authResponse.ok) {
          authenticators = await authResponse.json();
          console.log('🔍 Retrieved authenticators data from primary endpoint');
        } else {
          // If the primary endpoint fails, try the myaccount endpoint
          console.log('🔄 Primary endpoint failed, trying myaccount endpoint...');
          const fallbackResponse = await fetch(`https://fcxdemo.okta.com/idp/myaccount/authenticators`, {
            headers: {
              'Authorization': `Bearer ${tokens.accessToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          
          console.log('🔍 Fallback API response status:', fallbackResponse.status);
          
          if (fallbackResponse.ok) {
            authenticators = await fallbackResponse.json();
            console.log('🔍 Retrieved authenticators from fallback endpoint');
          } else {
            throw new Error(`Both endpoints failed: ${authResponse.status} and ${fallbackResponse.status}`);
          }
        }
        
        if (authenticators) {
          console.log('🔍 Processing authenticator data for Fastpass check...');
          
          // Look for Okta Verify enrollment
          const oktaVerifyEnrolled = authenticators.some((auth: any) => 
            auth.name === 'Okta Verify' && 
            auth.enrollments && 
            auth.enrollments.length > 0
          );

          // Get current user stats to check if this is first time verification
          const userStats = await gamificationService.getUserStats(user.oktaId);
          const isFirstTimeVerification = !userStats.fastpassVerified;

          if (oktaVerifyEnrolled) {
            // Record gamification for Fastpass verification
            const gamificationResult = await gamificationService.recordFastpassVerification(
              user.oktaId, 
              isFirstTimeVerification
            );

            // Create automatic message based on first-time vs repeat verification
            let autoMessage = '';
            let autoResponse = '';

            if (isFirstTimeVerification && gamificationResult.points > 0) {
              autoMessage = 'Welcome! Fastpass enrollment detected - Security rewards earned';
              autoResponse = JSON.stringify({
                response: `**🎉 Welcome Back & Security Achievement Unlocked!**\n\nGreat job! I've detected that you have Fastpass (Okta Verify) enrolled and secured. This is excellent for our organization's security posture!\n\n🎮 **Security Reward Earned:**\n• **${gamificationResult.points} points** for driving security compliance\n• **${gamificationResult.badgesEarned.length > 0 ? gamificationResult.badgesEarned.join(', ') + ' badge' : 'Security verification'}** completed\n\n**Your Security Status:** ✅ Fastpass Enabled & Enrolled\n**Device Security:** ✅ Verified\n\nYou're helping make our organization more secure! Thank you for being security-conscious.`,
                source: 'fastpass_auto_check',
                isAutoGenerated: true
              });
            } else {
              autoMessage = 'Welcome back! Fastpass enrollment verified - You are secured';
              autoResponse = JSON.stringify({
                response: `**🔒 Welcome Back! Security Status Verified ✅**\n\nYour Fastpass (Okta Verify) enrollment is active and your device is secured.\n\n**Security Status:** ✅ Fastpass Enabled & Enrolled\n**Device Security:** ✅ Verified\n\nGreat job maintaining excellent security practices!`,
                source: 'fastpass_auto_check',
                isAutoGenerated: true
              });
            }

            // Save the automatic Fastpass check message
            await storage.createChatMessage({
              userId: user.id,
              message: autoMessage,
              response: autoResponse,
              messageType: 'assistant',
              command: 'fastpass_auto_check'
            });

            console.log('✅ Automatic Fastpass check completed with rewards:', {
              isFirstTime: isFirstTimeVerification,
              points: gamificationResult.points,
              badges: gamificationResult.badgesEarned
            });
            console.log('✅ Auto Fastpass message saved to database for user:', user.name);
          } else {
            // User doesn't have Okta Verify enrolled - encourage enrollment
            const autoMessage = 'Fastpass enrollment check - Action needed for security';
            const autoResponse = JSON.stringify({
              response: `**🔒 Security Enhancement Opportunity**\n\nI noticed you haven't enrolled in Fastpass (Okta Verify) yet. This is a great opportunity to enhance your security!\n\n**Why Fastpass?**\n• Stronger device security\n• Faster, more secure authentication\n• Helps protect our organization\n\n**Next Steps:**\n• Download Okta Verify from your app store\n• Complete the enrollment process\n• Earn security points and badges!\n\n**Potential Reward:** 🎯 50 points + Security Champion badge awaiting your enrollment!`,
              source: 'fastpass_auto_check',
              isAutoGenerated: true
            });

            await storage.createChatMessage({
              userId: user.id,
              message: autoMessage,
              response: autoResponse,
              messageType: 'assistant',
              command: 'fastpass_auto_check'
            });

            console.log('✅ Automatic Fastpass check completed - user not enrolled, encouragement message sent');
          }
        } else {
          console.log('⚠️ Could not check Fastpass enrollment - API call failed:', authResponse.status);
        }
      } catch (fastpassError) {
        console.error('❌ Automatic Fastpass check failed:', fastpassError);
        
        // Create a user-friendly error message in the chat
        const errorMessage = 'Fastpass enrollment check temporarily unavailable - authentication system connectivity issue';
        const errorResponse = JSON.stringify({
          response: `**⚠️ Fastpass Status Check**\n\nI'm currently unable to verify your Fastpass enrollment status due to a temporary connectivity issue with the authentication system.\n\n**What this means:**\n• Your account security isn't affected\n• Fastpass may still be properly configured\n• This is just a status check issue\n\n**Next steps:**\n• Try the manual "Test Fastpass" button in the dashboard\n• Check back in a few minutes\n• Contact IT support if the issue persists\n\nI'll continue to help with other governance and access management tasks.`,
          source: 'fastpass_error',
          isAutoGenerated: true
        });

        await storage.createChatMessage({
          userId: user.id,
          message: errorMessage,
          response: errorResponse,
          messageType: 'assistant',
          command: 'fastpass_error_check'
        });
        
        // Don't fail the login process if Fastpass check fails
      }

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
      
      // Debug: Log token scopes to verify comprehensive governance access
      console.log('🔍 Token scopes for debugging:', {
        hasAccessToken: !!session.oktaTokens.accessToken,
        tokenScope: session.oktaTokens.scope || 'NO_SCOPE_INFO',
        accessTokenLength: session.oktaTokens.accessToken?.length || 0
      });
      
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

  // Governance OAuth routes
  app.get('/api/governance/auth-url', async (req, res) => {
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
      
      // Check if user already has governance tokens
      if (oktaAuth.hasGovernanceTokens(user.oktaId)) {
        return res.json({
          action: 'governance_already_authenticated',
          status: 'success',
          message: 'User already has governance access'
        });
      }
      
      // Generate governance OAuth URL
      const authUrl = oktaAuth.getGovernanceAuthUrl();
      
      res.json({
        action: 'governance_oauth_flow',
        status: 'redirect_required',
        message: 'Governance authentication required for access requests',
        authUrl: authUrl
      });
    } catch (error) {
      console.error('❌ Governance auth URL generation failed:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate governance auth URL' 
      });
    }
  });

  app.get('/api/auth/governance/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing authorization code or state' });
      }
      
      // Exchange code for governance tokens
      const tokens = await oktaAuth.exchangeGovernanceCodeForTokens(code as string, state as string);
      
      // Store tokens (we'll need to get user ID from session)
      const sessionId = req.cookies.session_id;
      if (sessionId) {
        const session = await storage.getSession(sessionId);
        if (session) {
          const user = await storage.getUser(session.userId);
          if (user) {
            oktaAuth.setGovernanceTokens(user.oktaId, tokens);
            console.log('✅ Governance tokens stored for user:', user.name);
          }
        }
      }
      
      // Return success page or close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOVERNANCE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Governance authentication successful. You can now make access requests.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('❌ Governance callback failed:', error);
      res.status(500).send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOVERNANCE_AUTH_ERROR', error: '${error instanceof Error ? error.message : 'Unknown error'}' }, '*');
                window.close();
              }
            </script>
            <p>Governance authentication failed. Please try again.</p>
          </body>
        </html>
      `);
    }
  });

  // Admin OAuth routes
  app.get('/api/admin/auth-url', async (req, res) => {
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
      
      // Check if user already has admin OAuth tokens
      if (oktaAuth.hasAdminOAuthTokens(user.oktaId)) {
        return res.json({
          action: 'admin_already_authenticated',
          status: 'success',
          message: 'User already has admin OAuth access'
        });
      }
      
      // Generate admin OAuth URL
      const authUrl = oktaAuth.getAdminOAuthUrl();
      
      res.json({
        action: 'admin_oauth_flow',
        status: 'redirect_required',
        message: 'Admin OAuth authentication required for admin operations',
        authUrl: authUrl
      });
    } catch (error) {
      console.error('❌ Admin OAuth URL generation failed:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate admin OAuth URL' 
      });
    }
  });

  app.get('/api/auth/admin/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing authorization code or state' });
      }
      
      // Exchange code for admin OAuth tokens
      const tokens = await oktaAuth.exchangeAdminCodeForTokens(code as string, state as string);
      
      // Store tokens (we'll need to get user ID from session)
      const sessionId = req.cookies.session_id;
      if (sessionId) {
        const session = await storage.getSession(sessionId);
        if (session) {
          const user = await storage.getUser(session.userId);
          if (user) {
            oktaAuth.setAdminOAuthTokens(user.oktaId, tokens);
            console.log('✅ Admin OAuth tokens stored for user:', user.name);
          }
        }
      }
      
      // Return success page or close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'ADMIN_OAUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Admin OAuth authentication successful. You now have admin privileges.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('❌ Admin OAuth callback failed:', error);
      res.status(500).send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'ADMIN_OAUTH_ERROR', error: '${error instanceof Error ? error.message : 'Unknown error'}' }, '*');
                window.close();
              }
            </script>
            <p>Admin OAuth authentication failed. Please try again.</p>
          </body>
        </html>
      `);
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
        
        // Handle governance authentication requirement
        if (llmResult.data?.action === 'governance_auth_required') {
          console.log('🏛️ Governance auth required, sending special response');
          
          // Save response with governance auth flag  
          await storage.createChatMessage({
            userId: user.id,
            message: finalResponse,
            response: JSON.stringify({ 
              response: finalResponse, 
              source: 'llm_automation',
              action: 'governance_auth_required',
              requiresGovernanceAuth: true,
              authUrl: llmResult.data?.authUrl
            }),
            messageType: 'assistant',
            command: 'chat'
          });

          console.log('🏛️ Sending governance auth response:', {
            action: 'governance_auth_required',
            requiresGovernanceAuth: true,
            authUrl: llmResult.data?.authUrl
          });

          return res.json({ 
            response: finalResponse,
            action: 'governance_auth_required',
            requiresGovernanceAuth: true,
            authUrl: llmResult.data?.authUrl,
            data: {
              response: finalResponse,
              action: 'governance_auth_required',
              requiresGovernanceAuth: true,
              authUrl: llmResult.data?.authUrl
            }
          });
        }
        
        // Handle special response types
        if (llmResult.requiresAdminAuth) {
          // Add admin session requirement handling with redirect info
          const adminData = llmResult.data;
          if (adminData?.adminUrl) {
            finalResponse += `\n\n🔐 **Redirecting to admin portal...**\n\nURL: ${adminData.adminUrl}`;
          }
        }
      } else if (llmResult.requiresAdminAuth) {
        console.log('🔐 Admin auth required, sending special response');
        // Handle admin authentication requirement
        finalResponse = llmResult.data?.response || 'Admin session required for this operation.';
        
        // Save response with admin auth flag
        await storage.createChatMessage({
          userId: user.id,
          message: finalResponse,
          response: JSON.stringify({ 
            response: finalResponse, 
            source: 'llm_automation',
            requiresAdminAuth: true,
            adminUrl: llmResult.data?.adminUrl 
          }),
          messageType: 'assistant',
          command: 'chat'
        });

        return res.json({ 
          response: finalResponse,
          requiresAdminAuth: true,
          adminUrl: llmResult.data?.adminUrl,
          action: llmResult.data?.action,
          adminState: llmResult.data?.adminState
        });
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

  // Gamification API endpoints
  app.get('/api/gamification/stats', async (req, res) => {
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

      const stats = await gamificationService.getUserStats(user.oktaId);
      res.json(stats);
    } catch (error) {
      console.error('Failed to get gamification stats:', error);
      res.status(500).json({ error: 'Failed to get gamification stats' });
    }
  });

  app.get('/api/gamification/leaderboard', async (req, res) => {
    try {
      const period = (req.query.period as 'weekly' | 'monthly' | 'all_time') || 'all_time';
      const limit = parseInt((req.query.limit as string) || '10');
      
      const leaderboard = await gamificationService.getLeaderboard(period, limit);
      res.json(leaderboard);
    } catch (error) {
      console.error('Failed to get leaderboard:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  app.post('/api/gamification/daily-visit', async (req, res) => {
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

      const result = await gamificationService.recordDailyVisit(user.oktaId);
      res.json(result);
    } catch (error) {
      console.error('Failed to record daily visit:', error);
      res.status(500).json({ error: 'Failed to record daily visit' });
    }
  });

  // Initialize gamification system
  try {
    await gamificationService.initializeBadges();
    console.log('✅ Gamification system initialized');
  } catch (error) {
    console.error('⚠️ Gamification initialization failed:', error);
  }

  return app;
}

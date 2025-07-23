import { randomBytes, createHash } from 'crypto';
import type { OktaUser, UserRole } from '@shared/schema';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

interface AdminSessionTokens {
  sessionToken: string;
  expiresAt: number;
}

interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export class OktaAuthService {
  private readonly oktaDomain: string;
  private readonly clientId: string;
  private readonly redirectUri: string;
  private pkceStore: Map<string, PkceChallenge> = new Map();
  private adminSessionStore: Map<string, AdminSessionTokens> = new Map();
  
  // Governance OAuth app configuration
  private readonly governanceClientId = 'okta.91d77ef1-82a4-5bed-b146-a1bea222f083';
  private readonly governanceRedirectUri: string;
  private governanceTokenStore: Map<string, OktaTokens> = new Map();
  
  // Admin OAuth app configuration
  private readonly adminClientId = 'okta.b58d5b75-07d4-5f25-bf59-368a1261a405';
  private readonly adminRedirectUri: string;
  private adminTokenStore: Map<string, OktaTokens> = new Map();

  constructor() {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.clientId = process.env.OKTA_CLIENT_ID || '';
    
    // Use custom domain for production deployment
    this.redirectUri = 'https://atko.kriyahub.com/api/auth/callback';
    this.governanceRedirectUri = 'https://atko.kriyahub.com/api/auth/governance/callback';
    this.adminRedirectUri = 'https://atko.kriyahub.com/api/auth/admin/callback';
    
    console.log('🔧 Okta Auth Service initialized:');
    console.log('  Domain:', this.oktaDomain);
    console.log('  Client ID:', this.clientId ? '✓ Configured' : '✗ Missing');
    console.log('  Redirect URI:', this.redirectUri);
    console.log('  Governance Client ID:', this.governanceClientId);
    console.log('  Governance Redirect URI:', this.governanceRedirectUri);
    console.log('  Admin Client ID:', this.adminClientId);
    console.log('  Admin Redirect URI:', this.adminRedirectUri);
    console.log('  Custom Domain: atko.kriyahub.com');

    if (!this.clientId) {
      console.warn('Okta client ID not configured. Set OKTA_CLIENT_ID environment variable.');
    }
  }

  getAuthUrl(): string {
    const pkceChallenge = this.generatePkceChallenge();
    const state = pkceChallenge.state;
    
    // Store PKCE challenge for later verification
    this.pkceStore.set(state, pkceChallenge);
    
    const baseUrl = `https://${this.oktaDomain}/oauth2/v1/authorize`;
    
    // Comprehensive scopes for full governance and access request capabilities
    const scopes = [
      'openid',
      'profile', 
      'email',
      'okta.accessRequests.catalog.read',
      'okta.accessRequests.request.manage',
      'okta.accessRequests.request.read',
      'okta.authenticators.manage.self',
      'okta.enduser.dashboard.manage',
      'okta.enduser.dashboard.read', 
      'okta.enduser.manage',
      'okta.enduser.read',
      'okta.governance.accessCertifications.manage',
      'okta.governance.accessCertifications.read',
      'okta.myAccount.authenticators.read',
      'okta.myAccount.profile.manage',
      'okta.myAccount.profile.read',
      'okta.myAccount.sessions.manage',
      'okta.users.manage.self',
      'okta.users.read.self'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: scopes,
      redirect_uri: this.redirectUri,
      state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  getGovernanceAuthUrl(): string {
    const pkceChallenge = this.generatePkceChallenge();
    const state = pkceChallenge.state;
    
    // Store PKCE challenge for later verification
    this.pkceStore.set(state, pkceChallenge);
    
    const baseUrl = `https://${this.oktaDomain}/oauth2/v1/authorize`;
    
    const params = new URLSearchParams({
      client_id: this.governanceClientId,
      response_type: 'code',
      scope: 'openid profile email online_access okta.accessRequests.catalog.read okta.accessRequests.request.manage okta.accessRequests.request.read',
      redirect_uri: this.governanceRedirectUri,
      state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  getAdminOAuthUrl(): string {
    const pkceChallenge = this.generatePkceChallenge();
    const state = pkceChallenge.state;
    
    // Store PKCE challenge for later verification
    this.pkceStore.set(state, pkceChallenge);
    
    const baseUrl = `https://${this.oktaDomain}/oauth2/v1/authorize`;
    
    const params = new URLSearchParams({
      client_id: this.adminClientId,
      response_type: 'code',
      response_mode: 'query',
      scope: 'openid okta.governance.read okta.governance.manage okta.groups.manage okta.groups.read okta.users.manage okta.users.read',
      redirect_uri: this.adminRedirectUri,
      state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${baseUrl}?${params.toString()}`;
  }

  getAdminAuthUrl(state: string): string {
    // Simple redirect to admin dashboard for authentication
    // User authenticates there and we detect they're back via popup messaging
    const adminDomain = this.oktaDomain.replace('.okta.com', '-admin.okta.com');
    return `https://${adminDomain}/admin/dashboard`;
  }

  getAdminDashboardUrl(): string {
    // Convert fcxdemo.okta.com to fcxdemo-admin.okta.com/admin/dashboard
    const domain = this.oktaDomain.replace('.okta.com', '-admin.okta.com');
    return `https://${domain}/admin/dashboard`;
  }

  storeAdminSessionToken(userId: string, sessionToken: string, expiresAt: number): void {
    this.adminSessionStore.set(userId, {
      sessionToken,
      expiresAt
    });
  }

  getAdminSessionToken(userId: string): AdminSessionTokens | null {
    const session = this.adminSessionStore.get(userId);
    if (!session || Date.now() > session.expiresAt) {
      this.adminSessionStore.delete(userId);
      return null;
    }
    return session;
  }

  setAdminSessionToken(userId: string, sessionToken: string): void {
    // Store token with 1 hour expiration
    const expiresAt = Date.now() + (60 * 60 * 1000);
    this.adminSessionStore.set(userId, { sessionToken, expiresAt });
  }

  private generatePkceChallenge(): PkceChallenge {
    const codeVerifier = this.base64URLEncode(randomBytes(32));
    const codeChallenge = this.base64URLEncode(createHash('sha256').update(codeVerifier).digest());
    const state = this.generateState();
    
    return {
      codeVerifier,
      codeChallenge,
      state
    };
  }

  private base64URLEncode(str: Buffer): string {
    return str.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async introspectToken(accessToken: string): Promise<any> {
    const introspectionUrl = `https://${this.oktaDomain}/oauth2/v1/introspect`;
    
    const body = new URLSearchParams({
      token: accessToken,
      token_type_hint: 'access_token'
    });

    const response = await fetch(introspectionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:`).toString('base64')}`
      },
      body: body.toString()
    });

    if (!response.ok) {
      throw new Error(`Token introspection failed: ${response.status}`);
    }

    return await response.json();
  }

  async exchangeCode(code: string, state: string): Promise<OktaTokens> {
    const tokenUrl = `https://${this.oktaDomain}/oauth2/v1/token`;
    
    // Retrieve PKCE challenge using state
    const pkceChallenge = this.pkceStore.get(state);
    if (!pkceChallenge) {
      throw new Error('Invalid state parameter or PKCE challenge not found');
    }
    
    // Clean up the PKCE challenge
    this.pkceStore.delete(state);
    
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      redirect_uri: this.redirectUri,
      code_verifier: pkceChallenge.codeVerifier
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    
    // Debug: Log token scopes and full response
    console.log('🔑 Token exchange successful:');
    console.log('  - Access token length:', data.access_token?.length || 0);
    console.log('  - Scopes granted:', data.scope || 'NOT RETURNED');
    console.log('  - Token type:', data.token_type);
    console.log('  - Expires in:', data.expires_in, 'seconds');
    console.log('  - Full token response keys:', Object.keys(data));
    
    // If scope is not returned, try to introspect the token to get scopes
    let finalScope = data.scope;
    if (!finalScope) {
      try {
        console.log('🔍 Scope not returned in token response, trying introspection...');
        const introspectionResult = await this.introspectToken(data.access_token);
        finalScope = introspectionResult?.scope;
        console.log('🔍 Introspection result scope:', finalScope);
      } catch (introspectionError) {
        console.warn('⚠️ Token introspection failed:', introspectionError);
      }
    }

    return {
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: finalScope
    };
  }

  async getUserInfo(accessToken: string): Promise<OktaUser> {
    const userInfoUrl = `https://${this.oktaDomain}/oauth2/v1/userinfo`;
    
    const response = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get user info: ${error}`);
    }

    const userInfo = await response.json();
    
    // Get user groups from Okta Management API
    const groups = await this.getUserGroups(accessToken, userInfo.sub);

    return {
      id: userInfo.sub,
      profile: {
        login: userInfo.preferred_username || userInfo.email,
        email: userInfo.email,
        firstName: userInfo.given_name,
        lastName: userInfo.family_name
      },
      groups
    };
  }

  private async getUserGroups(accessToken: string, userId: string): Promise<string[]> {
    try {
      // Use the Management API token to get both groups and admin roles
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        console.warn('No management API token configured, cannot fetch user groups');
        return [];
      }

      // Get user's groups
      const groupsUrl = `https://${this.oktaDomain}/api/v1/users/${userId}/groups`;
      const groupsResponse = await fetch(groupsUrl, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      let groups: string[] = [];
      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        groups = groupsData.map((group: any) => group.profile.name);
      }

      // Get user's assigned admin roles using the correct API endpoint
      const assignedRolesUrl = `https://${this.oktaDomain}/api/v1/users/${userId}/roles`;
      const assignedRolesResponse = await fetch(assignedRolesUrl, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (assignedRolesResponse.ok) {
        const assignedRoles = await assignedRolesResponse.json();
        console.log('🎭 User assigned admin roles:', assignedRoles.map((r: any) => r.type));
        
        // Map Okta admin role types to our group names using the official API response
        assignedRoles.forEach((role: any) => {
          switch (role.type) {
            case 'SUPER_ADMIN':
            case 'ORG_ADMIN':
              groups.push('Super Admins');
              break;
            case 'APP_ADMIN':
              groups.push('App Admins');
              break;
            case 'GROUP_ADMIN':
              groups.push('Group Admins');
              break;
            case 'GROUP_MEMBERSHIP_ADMIN':
              groups.push('Group Membership Admins');
              break;
            case 'USER_ADMIN':
              groups.push('User Admins');
              break;
            case 'HELP_DESK_ADMIN':
              groups.push('Help Desk Admins');
              break;
            case 'READ_ONLY_ADMIN':
              groups.push('Read Only Admins');
              break;
            case 'MOBILE_ADMIN':
              groups.push('Mobile Admins');
              break;
            case 'API_ACCESS_MANAGEMENT_ADMIN':
              groups.push('API Access Management Admins');
              break;
            case 'REPORT_ADMIN':
              groups.push('Report Admins');
              break;
          }
        });
      }

      console.log('👥 Final user groups and roles:', groups);
      return groups;
    } catch (error) {
      console.error('Error fetching user groups and roles:', error);
      return [];
    }
  }

  // Get all user roles for display purposes including custom roles
  async getAllUserRoles(userId: string, groups: string[]): Promise<string[]> {
    const roleLabels: string[] = [];
    
    console.log('🔍 Processing user role badges from groups:', groups);
    
    // Map role groups to display labels with additional info for group admins
    const roleMapping: Record<string, string> = {
      'Super Admins': 'Super Admin',
      'App Admins': 'App Admin', 
      'User Admins': 'User Admin',
      'Group Admins': 'Group Admin',
      'Group Membership Admins': 'Group Membership Admin',
      'Help Desk Admins': 'Help Desk Admin',
      'Read Only Admins': 'Read Only Admin',
      'Mobile Admins': 'Mobile Admin',
      'API Access Management Admins': 'API Access Admin',
      'Report Admins': 'Report Admin'
    };
    
    // Add all matching role labels with null safety
    if (groups && Array.isArray(groups)) {
      groups.forEach(group => {
        if (roleMapping[group]) {
          roleLabels.push(roleMapping[group]);
        }
      });
    }
    
    // Check for custom roles
    try {
      const managementToken = process.env.OKTA_API_TOKEN;
      if (managementToken && userId) {
        const assignedRolesResponse = await fetch(`https://${this.oktaDomain}/api/v1/users/${userId}/roles`, {
          headers: {
            'Authorization': `SSWS ${managementToken}`,
            'Accept': 'application/json'
          }
        });

        if (assignedRolesResponse.ok) {
          const assignedRoles = await assignedRolesResponse.json();
          
          // Add custom role labels
          assignedRoles.forEach((role: any) => {
            if (role.type === 'CUSTOM' && role.label) {
              // Format custom role labels nicely
              const formattedLabel = role.label
                .split('_')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              roleLabels.push(formattedLabel);
              console.log('✅ Added custom role:', formattedLabel);
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ Error fetching custom roles:', error);
    }
    
    console.log('🏷️ All role badges:', roleLabels);
    return roleLabels.length > 0 ? Array.from(new Set(roleLabels)) : ['User']; // Remove duplicates
  }

  // Get groups that a Group Membership Admin can manage
  async getManageableGroups(userId: string): Promise<string[]> {
    try {
      console.log('🔍 Getting manageable groups for user ID:', userId);
      
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        console.warn('❌ No management API token configured');
        return [];
      }

      // Get user's assigned admin roles with targets
      const assignedRolesUrl = `https://${this.oktaDomain}/api/v1/users/${userId}/roles`;
      console.log('🔍 Fetching user roles from:', assignedRolesUrl);
      
      const assignedRolesResponse = await fetch(assignedRolesUrl, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!assignedRolesResponse.ok) {
        console.error('❌ Failed to fetch user roles:', assignedRolesResponse.status, assignedRolesResponse.statusText);
        return [];
      }

      const assignedRoles = await assignedRolesResponse.json();
      console.log('📋 All assigned roles for user:', JSON.stringify(assignedRoles, null, 2));
      
      // Handle both standard and custom roles
      const groupAdminRoles = assignedRoles.filter((role: any) => 
        role.type === 'GROUP_MEMBERSHIP_ADMIN' || 
        role.type === 'GROUP_ADMIN' ||
        (role.type === 'CUSTOM' && (role.label?.includes('group') || role.label?.includes('admin')))
      );
      console.log('👥 Group admin roles found:', groupAdminRoles.length, groupAdminRoles.map((r: any) => ({ type: r.type, label: r.label })));

      const manageableGroups: string[] = [];

      // Process each role
      for (const role of groupAdminRoles) {
        console.log('🔍 Processing role:', { type: role.type, label: role.label, links: role._links });
        
        if (role.type === 'CUSTOM' && role['resource-set']) {
          // Handle custom roles with resource sets
          try {
            console.log('🔗 Fetching custom role resource set:', role['resource-set']);
            
            const resourceSetResponse = await fetch(`https://${this.oktaDomain}/api/v1/iam/resource-sets/${role['resource-set']}`, {
              headers: {
                'Authorization': `SSWS ${managementToken}`,
                'Accept': 'application/json'
              }
            });

            if (resourceSetResponse.ok) {
              const resourceSet = await resourceSetResponse.json();
              console.log('🎯 Resource set data:', JSON.stringify(resourceSet, null, 2));
              
              // Check if resource set includes group management
              if (resourceSet.resources && Array.isArray(resourceSet.resources)) {
                const hasGroupAccess = resourceSet.resources.some((resource: any) => 
                  resource.type === 'Group' || resource.type === 'GROUP' || 
                  resource.id === 'iam:groups' || resource.id?.includes('group')
                );
                
                if (hasGroupAccess) {
                  console.log('✅ Custom role has group management access, fetching all groups');
                  // For custom roles with group access, get all groups (resource set defines the scope)
                  const allGroupsResponse = await fetch(`https://${this.oktaDomain}/api/v1/groups?limit=200`, {
                    headers: {
                      'Authorization': `SSWS ${managementToken}`,
                      'Accept': 'application/json'
                    }
                  });
                  
                  if (allGroupsResponse.ok) {
                    const allGroups = await allGroupsResponse.json();
                    allGroups.forEach((group: any) => {
                      if (group.profile?.name) {
                        manageableGroups.push(group.profile.name);
                        console.log('✅ Added group from custom role:', group.profile.name);
                      }
                    });
                  }
                }
              }
            } else {
              console.error('❌ Failed to fetch resource set:', resourceSetResponse.status, resourceSetResponse.statusText);
            }
          } catch (error) {
            console.error('❌ Error fetching custom role resource set:', error);
          }
        } else if (role._links?.targets?.href) {
          try {
            console.log('🔗 Fetching targets from:', role._links.targets.href);
            
            const targetsResponse = await fetch(role._links.targets.href, {
              headers: {
                'Authorization': `SSWS ${managementToken}`,
                'Accept': 'application/json'
              }
            });

            console.log('📊 Targets response status:', targetsResponse.status);
            
            if (targetsResponse.ok) {
              const targets = await targetsResponse.json();
              console.log('🎯 Raw targets data:', JSON.stringify(targets, null, 2));
              console.log('🎯 Targets array length:', targets.length);
              console.log('🎯 Targets type check:', Array.isArray(targets));
              
              if (Array.isArray(targets)) {
                targets.forEach((target: any, index: number) => {
                  console.log(`🔍 Processing target ${index + 1}:`, {
                    type: target.type,
                    displayName: target.displayName,
                    name: target.name,
                    profile: target.profile,
                    id: target.id,
                    allKeys: Object.keys(target)
                  });
                  
                  // Check for different possible type values
                  if (target.type === 'Group' || target.type === 'GROUP' || target.type === 'group') {
                    const groupName = target.displayName || target.profile?.name || target.name;
                    if (groupName) {
                      manageableGroups.push(groupName);
                      console.log('✅ Added manageable group:', groupName);
                    } else {
                      console.warn('⚠️ Group target found but no name available:', target);
                    }
                  } else {
                    console.log(`⏭️ Skipping non-group target type: ${target.type}`);
                  }
                });
              } else {
                console.error('❌ Targets response is not an array:', typeof targets);
              }
            } else {
              console.error('❌ Failed to fetch targets:', targetsResponse.status, targetsResponse.statusText);
            }
          } catch (error) {
            console.error('❌ Error fetching role targets:', error);
          }
        } else {
          console.warn('⚠️ Role has no targets link:', role.type);
        }
      }

      console.log('✅ Final manageable groups list:', manageableGroups);
      return Array.from(new Set(manageableGroups)); // Remove duplicates
    } catch (error) {
      console.error('❌ Error fetching manageable groups:', error);
      return [];
    }
  }

  determineUserRole(groups: string[]): UserRole {
    console.log('🔍 Determining user role from assigned roles:', JSON.stringify(groups));
    
    // Priority-based role determination using official Okta role assignments
    // Super Admin has highest priority (org-wide access)
    const superAdminGroups = ['Super Admins'];
    if (groups.some(group => superAdminGroups.includes(group))) {
      console.log('👑 User has super admin access via assigned roles:', groups.filter(g => superAdminGroups.includes(g)));
      return 'super_admin';
    }

    // App Admin and other admin roles get app_owner privileges (highest priority for Steve Rogers with multiple roles)
    const adminGroups = [
      'App Admins', 
      'User Admins',
      'API Access Management Admins',
      'Report Admins'
    ];
    if (groups.some(group => adminGroups.includes(group))) {
      console.log('📱 User has admin access via assigned roles:', groups.filter(g => adminGroups.includes(g)));
      return 'app_owner';
    }

    // Group Membership Admin gets special group_admin role (only if no higher privileges)
    const groupAdminGroups = ['Group Membership Admins', 'Group Admins'];
    if (groups.some(group => groupAdminGroups.includes(group))) {
      console.log('👥 User has group admin access via assigned roles:', groups.filter(g => groupAdminGroups.includes(g)));
      return 'group_admin';
    }

    // Help Desk and Read Only admins get limited admin access
    const limitedAdminGroups = ['Help Desk Admins', 'Read Only Admins', 'Mobile Admins'];
    if (groups.some(group => limitedAdminGroups.includes(group))) {
      console.log('🛠️ User has limited admin access via assigned roles:', groups.filter(g => limitedAdminGroups.includes(g)));
      return 'app_owner';
    }

    // Legacy support for group-based roles (for backward compatibility)
    const legacyAdminGroups = ['Organization Administrators', 'Application Owners', 'Application Administrators'];
    if (groups.some(group => legacyAdminGroups.includes(group))) {
      console.log('🔄 User has legacy admin access via groups:', groups.filter(g => legacyAdminGroups.includes(g)));
      return groups.includes('Organization Administrators') ? 'super_admin' : 'app_owner';
    }

    console.log('👤 User has regular access - no admin roles assigned');
    return 'regular_user';
  }



  generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private generateState(): string {
    return randomBytes(16).toString('hex');
  }

  // Governance OAuth methods
  getGovernanceAuthUrl(): string {
    const pkceChallenge = this.generatePkceChallenge();
    const state = pkceChallenge.state;
    
    // Store PKCE challenge for later verification
    this.pkceStore.set(state, pkceChallenge);
    
    const baseUrl = `https://${this.oktaDomain}/oauth2/v1/authorize`;
    const scopes = [
      'openid',
      'profile', 
      'email',
      'online_access',
      'okta.accessRequests.catalog.read',
      'okta.accessRequests.request.manage',
      'okta.accessRequests.request.read'
    ].join(' ');

    const params = new URLSearchParams({
      client_id: this.governanceClientId,
      response_type: 'code',
      scope: scopes,
      redirect_uri: this.governanceRedirectUri,
      state: state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    console.log('🏛️ Generated governance auth URL with scopes:', scopes);
    return `${baseUrl}?${params.toString()}`;
  }

  async exchangeGovernanceCodeForTokens(code: string, state: string): Promise<OktaTokens> {
    const pkceChallenge = this.pkceStore.get(state);
    if (!pkceChallenge) {
      throw new Error('Invalid state parameter or PKCE challenge not found');
    }

    const tokenUrl = `https://${this.oktaDomain}/oauth2/v1/token`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.governanceClientId,
      code,
      redirect_uri: this.governanceRedirectUri,
      code_verifier: pkceChallenge.codeVerifier
    });

    console.log('🏛️ Exchanging governance code for tokens...');
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Governance token exchange failed:', response.status, errorText);
      throw new Error(`Governance token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('🏛️ Governance token exchange successful:');
    console.log('  - Access token length:', data.access_token?.length || 0);
    console.log('  - Scopes granted:', data.scope || 'NOT RETURNED');
    console.log('  - Token type:', data.token_type);
    console.log('  - Expires in:', data.expires_in, 'seconds');

    // Clean up PKCE challenge
    this.pkceStore.delete(state);

    const tokens = {
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope
    };

    return tokens;
  }

  async exchangeAdminCodeForTokens(code: string, state: string): Promise<OktaTokens> {
    const pkceChallenge = this.pkceStore.get(state);
    if (!pkceChallenge) {
      throw new Error('Invalid state parameter - PKCE challenge not found');
    }

    const tokenUrl = `https://${this.oktaDomain}/oauth2/v1/token`;
    
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.adminClientId,
      code,
      redirect_uri: this.adminRedirectUri,
      code_verifier: pkceChallenge.codeVerifier
    });

    console.log('🔐 Exchanging admin authorization code for tokens');
    console.log('  - Token URL:', tokenUrl);
    console.log('  - Client ID:', this.adminClientId);
    console.log('  - Redirect URI:', this.adminRedirectUri);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Admin token exchange failed:', response.status, errorText);
      throw new Error(`Admin token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    
    console.log('🔐 Admin token exchange successful:');
    console.log('  - Access token length:', data.access_token?.length || 0);
    console.log('  - Scopes granted:', data.scope || 'NOT RETURNED');
    console.log('  - Token type:', data.token_type);
    console.log('  - Expires in:', data.expires_in, 'seconds');

    // Clean up PKCE challenge
    this.pkceStore.delete(state);

    const tokens = {
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope
    };

    return tokens;
  }

  setGovernanceTokens(userId: string, tokens: OktaTokens): void {
    this.governanceTokenStore.set(userId, tokens);
    console.log('🏛️ Stored governance tokens for user:', userId);
  }

  getGovernanceTokens(userId: string): OktaTokens | undefined {
    return this.governanceTokenStore.get(userId);
  }

  hasGovernanceTokens(userId: string): boolean {
    const tokens = this.governanceTokenStore.get(userId);
    if (!tokens) return false;
    
    // Check if token is not expired (with 5 minute buffer)
    const expiresAt = Date.now() + (tokens.expiresIn * 1000);
    return expiresAt > Date.now() + (5 * 60 * 1000);
  }

  setAdminOAuthTokens(userId: string, tokens: OktaTokens): void {
    this.adminTokenStore.set(userId, tokens);
    console.log('🔐 Stored admin OAuth tokens for user:', userId);
  }

  getAdminOAuthTokens(userId: string): OktaTokens | undefined {
    return this.adminTokenStore.get(userId);
  }

  hasAdminOAuthTokens(userId: string): boolean {
    const tokens = this.adminTokenStore.get(userId);
    if (!tokens) return false;
    
    // Check if token is not expired (with 5 minute buffer)
    const expiresAt = Date.now() + (tokens.expiresIn * 1000);
    return expiresAt > Date.now() + (5 * 60 * 1000);
  }
}

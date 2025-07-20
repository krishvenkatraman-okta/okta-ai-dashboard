import { randomBytes, createHash } from 'crypto';
import type { OktaUser, UserRole } from '@shared/schema';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
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

  constructor() {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.clientId = process.env.OKTA_CLIENT_ID || '';
    
    // Use custom domain for production deployment
    this.redirectUri = 'https://atko.kriyahub.com/api/auth/callback';
    
    console.log('🔧 Okta Auth Service initialized:');
    console.log('  Domain:', this.oktaDomain);
    console.log('  Client ID:', this.clientId ? '✓ Configured' : '✗ Missing');
    console.log('  Redirect URI:', this.redirectUri);
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
    
    const baseUrl = `https://${this.oktaDomain}/oauth2/default/v1/authorize`;
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: this.redirectUri,
      state,
      code_challenge: pkceChallenge.codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${baseUrl}?${params.toString()}`;
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

  async exchangeCode(code: string, state: string): Promise<OktaTokens> {
    const tokenUrl = `https://${this.oktaDomain}/oauth2/default/v1/token`;
    
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
    return {
      accessToken: data.access_token,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  }

  async getUserInfo(accessToken: string): Promise<OktaUser> {
    const userInfoUrl = `https://${this.oktaDomain}/oauth2/default/v1/userinfo`;
    
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

  getAllUserRoles(groups: string[]): string[] {
    console.log('🏷️ Getting all user role badges from assigned roles:', JSON.stringify(groups));
    
    const roleLabels: string[] = [];
    
    // Map role groups to display labels with additional info for group admins
    const roleMapping = {
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
    
    // Add all matching role labels
    groups.forEach(group => {
      if (roleMapping[group]) {
        roleLabels.push(roleMapping[group]);
      }
    });
    
    console.log('🏷️ All role badges:', roleLabels);
    return roleLabels.length > 0 ? roleLabels : ['User'];
  }

  // Get groups that a Group Membership Admin can manage
  async getManageableGroups(userId: string): Promise<string[]> {
    try {
      const managementToken = process.env.OKTA_API_TOKEN;
      if (!managementToken) {
        console.warn('No management API token configured');
        return [];
      }

      // Get user's assigned admin roles with targets
      const assignedRolesUrl = `https://${this.oktaDomain}/api/v1/users/${userId}/roles`;
      const assignedRolesResponse = await fetch(assignedRolesUrl, {
        headers: {
          'Authorization': `SSWS ${managementToken}`,
          'Accept': 'application/json'
        }
      });

      if (!assignedRolesResponse.ok) {
        console.error('Failed to fetch user roles for group management');
        return [];
      }

      const assignedRoles = await assignedRolesResponse.json();
      const groupAdminRoles = assignedRoles.filter((role: any) => 
        role.type === 'GROUP_MEMBERSHIP_ADMIN' || role.type === 'GROUP_ADMIN'
      );

      const manageableGroups: string[] = [];

      // For each group admin role, get the target groups
      for (const role of groupAdminRoles) {
        if (role._links?.targets?.href) {
          try {
            const targetsResponse = await fetch(role._links.targets.href, {
              headers: {
                'Authorization': `SSWS ${managementToken}`,
                'Accept': 'application/json'
              }
            });

            if (targetsResponse.ok) {
              const targets = await targetsResponse.json();
              targets.forEach((target: any) => {
                if (target.type === 'Group' && target.displayName) {
                  manageableGroups.push(target.displayName);
                }
              });
            }
          } catch (error) {
            console.error('Error fetching role targets:', error);
          }
        }
      }

      console.log('👥 Groups user can manage:', manageableGroups);
      return [...new Set(manageableGroups)]; // Remove duplicates
    } catch (error) {
      console.error('Error fetching manageable groups:', error);
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

  // Get all user roles for display purposes based on official Okta role assignments
  getAllUserRoles(groups: string[]): string[] {
    const roles: string[] = [];
    
    // Check for exact role mappings from Okta API response
    const roleMapping = {
      'Super Admins': 'Super Admin',
      'App Admins': 'App Admin', 
      'Group Admins': 'Group Admin',
      'Group Membership Admins': 'Group Membership Admin',
      'User Admins': 'User Admin',
      'Help Desk Admins': 'Help Desk Admin',
      'Read Only Admins': 'Read Only Admin',
      'Mobile Admins': 'Mobile Admin',
      'API Access Management Admins': 'API Access Management Admin',
      'Report Admins': 'Report Admin'
    };

    // Map groups to display roles
    groups.forEach(group => {
      if (roleMapping[group]) {
        roles.push(roleMapping[group]);
      }
    });

    // Legacy group support for backward compatibility
    const legacyMappings = {
      'Organization Administrators': 'Super Admin',
      'Application Owners': 'App Owner',
      'Application Administrators': 'App Owner'
    };

    groups.forEach(group => {
      if (legacyMappings[group] && !roles.includes(legacyMappings[group])) {
        roles.push(legacyMappings[group]);
      }
    });

    return roles.length > 0 ? roles : ['Regular User'];
  }

  generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private generateState(): string {
    return randomBytes(16).toString('hex');
  }
}

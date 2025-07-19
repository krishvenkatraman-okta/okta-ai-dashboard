import { randomBytes } from 'crypto';
import type { OktaUser, UserRole } from '@shared/schema';

interface OktaTokens {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export class OktaAuthService {
  private readonly oktaDomain: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.oktaDomain = process.env.OKTA_DOMAIN || 'fcxdemo.okta.com';
    this.clientId = process.env.OKTA_CLIENT_ID || '';
    this.clientSecret = process.env.OKTA_CLIENT_SECRET || '';
    this.redirectUri = process.env.OKTA_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';

    if (!this.clientId || !this.clientSecret) {
      console.warn('Okta credentials not configured. Set OKTA_CLIENT_ID and OKTA_CLIENT_SECRET environment variables.');
    }
  }

  getAuthUrl(): string {
    const state = this.generateState();
    const baseUrl = `https://${this.oktaDomain}/oauth2/default/v1/authorize`;
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'openid profile email groups',
      redirect_uri: this.redirectUri,
      state
    });

    return `${baseUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OktaTokens> {
    const tokenUrl = `https://${this.oktaDomain}/oauth2/default/v1/token`;
    
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri
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
      const groupsUrl = `https://${this.oktaDomain}/api/v1/users/${userId}/groups`;
      
      const response = await fetch(groupsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to fetch user groups, using default role');
        return [];
      }

      const groups = await response.json();
      return groups.map((group: any) => group.profile.name);
    } catch (error) {
      console.error('Error fetching user groups:', error);
      return [];
    }
  }

  determineUserRole(groups: string[]): UserRole {
    // Check for super admin groups
    const superAdminGroups = ['Everyone', 'Super Admins', 'Org Admins'];
    if (groups.some(group => superAdminGroups.includes(group))) {
      return 'super_admin';
    }

    // Check for app owner groups
    const appOwnerGroups = ['App Admins', 'Application Owners'];
    if (groups.some(group => appOwnerGroups.includes(group))) {
      return 'app_owner';
    }

    return 'regular_user';
  }

  generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private generateState(): string {
    return randomBytes(16).toString('hex');
  }
}

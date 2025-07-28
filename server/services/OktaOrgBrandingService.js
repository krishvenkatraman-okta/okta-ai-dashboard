/**
 * Okta Organization Branding Service
 * Fetches organization-specific branding including logos, stylesheets, and theme configurations
 */

class OktaOrgBrandingService {
  constructor(domain, sessionToken) {
    this.domain = domain;
    this.sessionToken = sessionToken;
    this.baseUrl = `https://${domain}`;
  }

  /**
   * Fetch organization branding from /UserHome endpoint
   * Returns custom stylesheets and theme configurations
   */
  async fetchUserHomeBranding() {
    try {
      console.log('🎨 Fetching org branding from /UserHome...');
      
      const response = await fetch(`${this.baseUrl}/UserHome`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        console.error('❌ UserHome fetch failed:', response.status);
        return null;
      }

      const html = await response.text();
      
      // Extract custom stylesheets from HTML
      const styleSheets = this.extractStyleSheets(html);
      const themeConfig = this.extractThemeConfig(html);
      
      console.log('✅ UserHome branding extracted:', { 
        styleSheets: styleSheets.length, 
        themeConfig: !!themeConfig 
      });
      
      return {
        styleSheets,
        themeConfig,
        source: 'UserHome'
      };
    } catch (error) {
      console.error('❌ Error fetching UserHome branding:', error);
      return null;
    }
  }

  /**
   * Fetch organization logo and branding from enduser API
   * Returns logo URLs and brand configurations
   */
  async fetchEnduserHomeBranding() {
    try {
      console.log('🏢 Fetching org logo from /enduser/api/v1/home...');
      
      const response = await fetch(`${this.baseUrl}/enduser/api/v1/home`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Enduser home API failed:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('✅ Enduser home data received:', Object.keys(data));
      
      // Extract logo and branding information
      const branding = this.extractBrandingFromEnduser(data);
      
      return {
        ...branding,
        source: 'enduserApi'
      };
    } catch (error) {
      console.error('❌ Error fetching enduser home branding:', error);
      return null;
    }
  }

  /**
   * Get comprehensive organization branding
   * Combines data from both UserHome and enduser API
   */
  async getOrgBranding() {
    try {
      console.log('🎯 Fetching comprehensive org branding...');
      
      // Fetch from both endpoints simultaneously
      const [userHomeBranding, enduserBranding] = await Promise.all([
        this.fetchUserHomeBranding(),
        this.fetchEnduserHomeBranding()
      ]);

      // Combine branding data
      const combinedBranding = {
        orgLogo: null,
        orgName: null,
        customStyles: [],
        themeConfig: null,
        colors: {
          primary: null,
          secondary: null,
          background: null
        },
        fonts: null,
        customCss: null
      };

      // Apply UserHome branding
      if (userHomeBranding) {
        combinedBranding.customStyles = userHomeBranding.styleSheets || [];
        combinedBranding.themeConfig = userHomeBranding.themeConfig;
        combinedBranding.customCss = userHomeBranding.customCss;
      }

      // Apply enduser API branding
      if (enduserBranding) {
        combinedBranding.orgLogo = enduserBranding.orgLogo;
        combinedBranding.orgName = enduserBranding.orgName;
        if (enduserBranding.colors) {
          combinedBranding.colors = { ...combinedBranding.colors, ...enduserBranding.colors };
        }
        combinedBranding.fonts = enduserBranding.fonts;
      }

      console.log('🎨 Combined org branding ready:', {
        hasLogo: !!combinedBranding.orgLogo,
        hasStyles: combinedBranding.customStyles.length > 0,
        hasColors: !!combinedBranding.colors.primary
      });

      return combinedBranding;
    } catch (error) {
      console.error('❌ Error getting org branding:', error);
      return null;
    }
  }

  /**
   * Extract stylesheets from UserHome HTML
   */
  extractStyleSheets(html) {
    const styleSheets = [];
    
    // Extract <link> tags for CSS
    const linkMatches = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
    linkMatches.forEach(link => {
      const hrefMatch = link.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        styleSheets.push({
          type: 'link',
          href: hrefMatch[1].startsWith('http') ? hrefMatch[1] : `${this.baseUrl}${hrefMatch[1]}`,
          original: link
        });
      }
    });

    // Extract <style> blocks
    const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
    styleMatches.forEach(style => {
      const contentMatch = style.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (contentMatch) {
        styleSheets.push({
          type: 'inline',
          content: contentMatch[1],
          original: style
        });
      }
    });

    return styleSheets;
  }

  /**
   * Extract theme configuration from HTML
   */
  extractThemeConfig(html) {
    // Look for theme configuration in script tags or data attributes
    const themeMatches = html.match(/(?:theme|brand|config)[^}]*{[^}]*}/gi) || [];
    
    // Look for CSS custom properties
    const customProps = html.match(/--[^:;]+:[^;]+;/gi) || [];
    
    return {
      themeMatches,
      customProperties: customProps
    };
  }

  /**
   * Extract branding information from enduser API response
   */
  extractBrandingFromEnduser(data) {
    const branding = {
      orgLogo: null,
      orgName: null,
      colors: {},
      fonts: null
    };

    // Common paths where logo might be found
    const logoPaths = [
      'orgLogo',
      'logo',
      'branding.logo',
      'theme.logo',
      'customization.logo',
      'brand.logoUrl',
      'settings.logo'
    ];

    // Common paths where org name might be found
    const namePaths = [
      'orgName', 
      'organizationName',
      'companyName',
      'brand.name',
      'settings.orgName'
    ];

    // Extract logo
    for (const path of logoPaths) {
      const value = this.getNestedProperty(data, path);
      if (value) {
        branding.orgLogo = value.startsWith('http') ? value : `${this.baseUrl}${value}`;
        break;
      }
    }

    // Extract org name
    for (const path of namePaths) {
      const value = this.getNestedProperty(data, path);
      if (value) {
        branding.orgName = value;
        break;
      }
    }

    // Extract color scheme
    const colorPaths = [
      'theme.primaryColor',
      'branding.primaryColor', 
      'colors.primary',
      'customization.primaryColor'
    ];

    for (const path of colorPaths) {
      const value = this.getNestedProperty(data, path);
      if (value) {
        branding.colors.primary = value;
        break;
      }
    }

    return branding;
  }

  /**
   * Get nested property from object using dot notation
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }
}

export default OktaOrgBrandingService;
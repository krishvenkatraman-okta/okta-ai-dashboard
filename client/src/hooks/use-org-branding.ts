import { useQuery } from '@tanstack/react-query';

interface OrgBranding {
  orgLogo: string | null;
  orgName: string;
  customStyles: Array<{
    type: 'link' | 'inline';
    href?: string;
    content?: string;
  }>;
  themeConfig: any;
  colors: {
    primary: string | null;
    secondary: string | null;
    background: string | null;
  };
  fonts: string | null;
  customCss: string | null;
  fallback?: boolean;
}

export function useOrgBranding() {
  return useQuery<OrgBranding>({
    queryKey: ['/api/org-branding'],
    queryFn: async () => {
      const response = await fetch('/api/org-branding', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch org branding');
      }
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false
  });
}
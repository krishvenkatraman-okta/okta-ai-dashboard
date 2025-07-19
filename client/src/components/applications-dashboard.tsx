import { useQuery } from "@tanstack/react-query";
import { Search, Grid3X3, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AppLink {
  id: string;
  label: string;
  linkUrl: string;
  logoUrl?: string;
  appName: string;
  appInstanceId: string;
  credentialsSetup?: boolean;
  hidden?: boolean;
  sortOrder: number;
}

export default function ApplicationsDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch user's app links (actual Okta end user dashboard data)
  const { data: appLinks, isLoading: appsLoading } = useQuery<AppLink[]>({
    queryKey: ['/api/user/applinks'],
    staleTime: 60000, // 1 minute
  });

  const filteredApps = appLinks?.filter(app => 
    app.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.appName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleLaunchApp = (app: AppLink) => {
    if (app.linkUrl) {
      window.open(app.linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getAppLogo = (app: AppLink) => {
    if (app.logoUrl) {
      return app.logoUrl;
    }
    // Generate initials-based logo for apps without icons
    const initials = app.label.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" fill="#007dc1" rx="8"/>
        <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" fill="white" text-anchor="middle" dominant-baseline="middle">${initials}</text>
      </svg>
    `)}`;
  };

  if (appsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(199,100%,38%)] mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your applications...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">My Apps</h1>
          <p className="text-gray-600">Access your applications with single sign-on</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between space-x-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  type="text"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 size={16} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Applications Grid/List */}
        {appsLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(199,100%,38%)] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading applications...</p>
          </div>
        ) : !appLinks || appLinks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Grid3X3 className="text-gray-400" size={24} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applications available</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              You don't have access to any applications yet. Contact your administrator if you need access to specific applications.
            </p>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            viewMode === 'grid' 
              ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' 
              : 'grid-cols-1'
          }`}>
            {filteredApps.map((app) => (
              <div
                key={app.id}
                onClick={() => handleLaunchApp(app)}
                className={`bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group ${
                  viewMode === 'grid' ? 'p-4' : 'p-4 flex items-center space-x-4'
                }`}
              >
                {viewMode === 'grid' ? (
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                      <img 
                        src={getAppLogo(app)} 
                        alt={`${app.label} logo`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = getAppLogo(app);
                        }}
                      />
                    </div>
                    <h3 className="font-medium text-gray-900 text-sm truncate group-hover:text-blue-600 transition-colors">
                      {app.label}
                    </h3>
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <img 
                        src={getAppLogo(app)} 
                        alt={`${app.label} logo`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = getAppLogo(app);
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {app.label}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{app.appName}</p>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Results count */}
        {appLinks && appLinks.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Showing {filteredApps.length} of {appLinks.length} applications
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
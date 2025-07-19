import { useQuery } from "@tanstack/react-query";
import { Globe, ExternalLink, Users, Dock, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Application {
  id: string;
  name: string;
  label: string;
  status: string;
  signOnMode: string;
  created: string;
  lastUpdated: string;
  settings?: {
    app?: {
      url?: string;
    };
  };
  visibility?: {
    hide?: {
      iOS?: boolean;
      web?: boolean;
    };
  };
}

interface DashboardStats {
  users: number;
  apps: number;
  pendingRequests: number;
}

export default function ApplicationsDashboard() {
  const { data: applications, isLoading: appsLoading } = useQuery<Application[]>({
    queryKey: ['/api/applications'],
    staleTime: 60000, // 1 minute
  });

  const { data: dashboardData } = useQuery<DashboardStats>({
    queryKey: ['/api/okta/dashboard-stats'],
    staleTime: 60000, // 1 minute
  });

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSignOnModeDisplay = (mode: string) => {
    switch (mode) {
      case 'SAML_2_0': return 'SAML 2.0';
      case 'WS_FEDERATION': return 'WS-Federation';
      case 'OPENID_CONNECT': return 'OpenID Connect';
      case 'AUTO_LOGIN': return 'Auto Login';
      case 'SECURE_WEB_AUTHENTICATION': return 'SWA';
      default: return mode || 'Unknown';
    }
  };

  const handleLaunchApp = (app: Application) => {
    const appUrl = app.settings?.app?.url;
    if (appUrl) {
      window.open(appUrl, '_blank');
    }
  };

  if (appsLoading) {
    return (
      <div className="h-full p-4">
        <div className="bg-gray-100 rounded-lg h-full flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(199,100%,38%)] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your applications...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Stats Overview */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Dashboard Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total Users</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {dashboardData?.users || '---'}
                  </p>
                </div>
                <Users className="text-blue-500" size={28} />
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Active Apps</p>
                  <p className="text-2xl font-bold text-green-700">
                    {applications?.length || dashboardData?.apps || '---'}
                  </p>
                </div>
                <Dock className="text-green-500" size={28} />
              </div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Pending Requests</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {dashboardData?.pendingRequests || '12'}
                  </p>
                </div>
                <Clock className="text-yellow-500" size={28} />
              </div>
            </div>
          </div>
        </div>

        {/* Applications Grid */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">My Applications</h2>
            <Badge variant="secondary" className="text-sm">
              {applications?.length || 0} applications
            </Badge>
          </div>

          {!applications || applications.length === 0 ? (
            <div className="text-center py-12">
              <Dock className="text-4xl text-gray-400 mb-4 mx-auto" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No applications available</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                You don't have access to any applications yet, or they're still being loaded from your organization.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-[hsl(199,100%,38%)] rounded-lg flex items-center justify-center flex-shrink-0">
                        <Globe className="text-white" size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate" title={app.label || app.name}>
                          {app.label || app.name}
                        </h3>
                        <p className="text-xs text-gray-500 truncate">
                          {getSignOnModeDisplay(app.signOnMode)}
                        </p>
                      </div>
                    </div>
                    <Badge className={`text-xs ${getStatusColor(app.status)}`}>
                      {app.status || 'Unknown'}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Created:</span>{' '}
                      {app.created ? new Date(app.created).toLocaleDateString() : 'Unknown'}
                    </div>
                    {app.settings?.app?.url && (
                      <div className="text-xs text-gray-600 truncate">
                        <span className="font-medium">URL:</span>{' '}
                        <span className="text-blue-600">{app.settings.app.url}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex items-center text-xs text-gray-500">
                      <Shield size={12} className="mr-1" />
                      SSO Enabled
                    </div>
                    {app.settings?.app?.url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLaunchApp(app)}
                        className="text-xs h-7"
                      >
                        <ExternalLink size={12} className="mr-1" />
                        Launch
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
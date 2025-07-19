import { useQuery } from "@tanstack/react-query";
import { Globe, Users, Dock, Clock } from "lucide-react";

export default function DashboardIframe() {
  const { data: dashboardData } = useQuery({
    queryKey: ['/api/okta/dashboard-stats'],
    staleTime: 60000, // 1 minute
  });

  return (
    <div className="h-full p-4">
      <div className="bg-gray-100 rounded-lg h-full">
        {/* Stats Overview */}
        <div className="p-4">
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <h2 className="text-lg font-semibold mb-4">Application Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Users</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {dashboardData?.users || '---'}
                    </p>
                  </div>
                  <Users className="text-blue-500" size={24} />
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Apps</p>
                    <p className="text-2xl font-bold text-green-600">
                      {dashboardData?.apps || '---'}
                    </p>
                  </div>
                  <Dock className="text-green-500" size={24} />
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending Requests</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {dashboardData?.pendingRequests || '---'}
                    </p>
                  </div>
                  <Clock className="text-yellow-500" size={24} />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Iframe Container */}
        <div className="px-4 pb-4 h-[calc(100%-200px)]">
          <div className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 h-full flex items-center justify-center">
            <div className="text-center">
              <Globe className="text-4xl text-gray-400 mb-4 mx-auto" size={48} />
              <p className="text-gray-500 font-medium">Okta Dashboard</p>
              <p className="text-sm text-gray-400">Loading dashboard content...</p>
              <div className="mt-4 text-xs text-gray-400">
                <div className="okta-card max-w-sm mx-auto">
                  <p className="font-medium text-gray-600 mb-2">Dashboard Integration</p>
                  <p className="text-xs">
                    After successful OIDC authentication, this area will display the Okta dashboard 
                    iframe with real-time organization data and management tools.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

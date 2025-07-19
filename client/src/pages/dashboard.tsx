import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Shield, Bell, LogOut, Dock } from "lucide-react";
import { Button } from "@/components/ui/button";
import GovernanceChat from "@/components/governance-chat";
import ApplicationsDashboard from "@/components/applications-dashboard";
import type { User } from "@shared/schema";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState('dashboard');

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          return null;
        }
        throw new Error(`Failed to fetch user: ${res.status}`);
      }
      
      return await res.json();
    }
  });

  useEffect(() => {
    if (!isLoading && !user && !error) {
      setLocation('/');
    }
  }, [user, isLoading, error, setLocation]);

  // Add debug logging
  useEffect(() => {
    console.log('Dashboard state:', { user, isLoading, error });
    // Also check auth status
    fetch('/api/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => console.log('Auth status:', data))
      .catch(console.error);
  }, [user, isLoading, error]);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      setLocation('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(199,100%,38%)] mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.error('Dashboard error:', error);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading dashboard</p>
          <p className="text-gray-600 text-sm">{error.message}</p>
          <Button onClick={() => setLocation('/')} className="mt-4">
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log('No user found, staying on dashboard to debug...');
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-8 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Debug: No User</h2>
          <p className="text-gray-600 mb-4">User object is null but should be authenticated</p>
          <pre className="text-xs bg-gray-100 p-2 rounded">
            {JSON.stringify({ user, isLoading, error: error?.message }, null, 2)}
          </pre>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  const navigationItems = [
    { id: 'dashboard', label: 'My Apps', icon: Dock },
    { id: 'assistant', label: 'Okta Assistant', icon: Shield },
  ];

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'app_owner': return 'App Owner';
      case 'regular_user': return 'User';
      default: return 'User';
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  console.log('Dashboard rendering with user:', user);
  
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Clean Okta-style header */}
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-[hsl(199,100%,38%)] rounded-lg flex items-center justify-center">
                <Shield className="text-white" size={20} />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Okta</h1>
              
              {/* Navigation tabs */}
              <nav className="flex space-x-6 ml-8">
                <button
                  onClick={() => setActiveNav('dashboard')}
                  className={`flex items-center space-x-2 px-3 py-1 text-sm font-medium border-b-2 transition-colors ${
                    activeNav === 'dashboard'
                      ? 'text-[hsl(199,100%,38%)] border-[hsl(199,100%,38%)]'
                      : 'text-gray-600 border-transparent hover:text-gray-900'
                  }`}
                >
                  <Dock size={16} />
                  <span>My Apps</span>
                </button>
              </nav>
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <Bell size={16} />
              </Button>
              
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-[hsl(199,100%,38%)] font-medium">{getRoleDisplayName(user.role)}</p>
                </div>
                <div className="w-8 h-8 bg-[hsl(199,100%,38%)] rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  size="sm"
                >
                  <LogOut size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 pt-16 flex">
        {/* Applications Dashboard */}
        <div className="flex-1">
          <ApplicationsDashboard />
        </div>

        {/* AI Assistant Sidebar */}
        <div className="w-96 bg-white border-l border-gray-200 shadow-lg">
          <div className="h-full">
            <GovernanceChat user={{ name: user.name, role: user.role }} />
          </div>
        </div>
      </div>
    </div>
  );
}
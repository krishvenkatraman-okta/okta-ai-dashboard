import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Shield, Users, Dock, BarChart3, Settings, Key, Server, History, Bell, LogOut, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import OktaAssistant from "@/components/okta-assistant";
import DashboardIframe from "@/components/dashboard-iframe";
import type { User } from "@shared/schema";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState('dashboard');

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/');
    }
  }, [user, isLoading, setLocation]);

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

  if (!user) {
    return null;
  }

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'applications', label: 'Applications', icon: Dock },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const pamItems = [
    { id: 'pam-sessions', label: 'PAM Sessions', icon: Key },
    { id: 'resources', label: 'Resources', icon: Server },
    { id: 'session-history', label: 'Session History', icon: History },
  ];

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Administrator';
      case 'app_owner': return 'Application Owner';
      case 'regular_user': return 'User';
      default: return 'User';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-4">
            <div className="bg-[hsl(199,100%,38%)] rounded-lg w-10 h-10 flex items-center justify-center">
              <Shield className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Okta Enterprise Portal</h1>
              <p className="text-sm text-gray-500">fcxdemo.okta.com</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Button variant="ghost" size="sm" className="p-2 text-gray-400 hover:text-gray-600 relative">
                <Bell size={18} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">3</span>
              </Button>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{getRoleDisplay(user.role)}</p>
              </div>
              <div className="w-8 h-8 bg-[hsl(199,100%,38%)] rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-semibold">{getUserInitials(user.name)}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-gray-400 hover:text-gray-600">
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <nav className="bg-white w-64 shadow-sm border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <ul className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center space-x-3 text-left p-2 rounded-lg transition-colors ${
                        activeNav === item.id 
                          ? 'okta-sidebar-active' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          
          {/* PAM Section */}
          <div className="p-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Privileged Access</h3>
            <ul className="space-y-2">
              {pamItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center space-x-3 text-left p-2 rounded-lg transition-colors ${
                        activeNav === item.id 
                          ? 'okta-sidebar-active' 
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden">
          <div className="h-full flex">
            {/* Okta Dashboard Iframe */}
            <div className="flex-1 bg-white border-r border-gray-200">
              <DashboardIframe />
            </div>

            {/* Okta Assistant Chatbot */}
            <div className="w-80">
              <OktaAssistant user={user} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

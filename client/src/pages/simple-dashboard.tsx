import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface User {
  id: number;
  name: string;
  role: string;
  email: string;
}

interface OktaApp {
  id: string;
  name: string;
  label: string;
  status?: string;
  linkUrl?: string;
  logoUrl?: string;
  appName?: string;
  appInstanceId?: string;
  sortOrder?: number;
  accessibility?: {
    selfService: boolean;
  };
  visibility?: {
    hide: {
      iOS: boolean;
      web: boolean;
    };
  };
  settings?: {
    app?: {
      url?: string;
    };
  };
  _links?: {
    logo?: Array<{
      name: string;
      href: string;
      type: string;
    }>;
    appLinks?: Array<{
      name: string;
      href: string;
    }>;
  };
}

function OktaApplicationsGrid({ user }: { user: User }) {
  const [apps, setApps] = useState<OktaApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await fetch('/api/okta/user-apps', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const appsData = await response.json();
          console.log('Fetched Okta apps:', appsData);
          console.log('Sample app structure:', JSON.stringify(appsData[0], null, 2));
          setApps(appsData);
        } else {
          console.log('Failed to fetch apps, falling back to iframe');
          setShowIframe(true);
        }
      } catch (error) {
        console.error('Error fetching apps:', error);
        setError('Failed to load applications');
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your applications...</p>
        </div>
      </div>
    );
  }

  if (showIframe) {
    return (
      <div className="h-full">
        <iframe
          src="https://fcxdemo.okta.com/app/UserHome?fromAdmin=true"
          className="w-full h-[600px] border border-gray-200 rounded-lg"
          title="Okta Applications"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={() => setShowIframe(true)} variant="outline">
          Load Okta Dashboard
        </Button>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">No applications assigned to your account.</p>
        <Button onClick={() => setShowIframe(true)} variant="outline">
          Open Okta Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
        {apps.map((app) => (
          <OktaApplicationTile key={app.id} app={app} />
        ))}
      </div>
      
      <div className="text-center pt-4">
        <Button onClick={() => setShowIframe(true)} variant="outline" size="sm">
          View All in Okta Dashboard
        </Button>
      </div>
    </div>
  );
}

function OktaApplicationTile({ app }: { app: OktaApp }) {
  const handleClick = () => {
    // For appLinks, use the linkUrl directly
    if (app.linkUrl) {
      window.open(app.linkUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // For regular apps, construct proper Okta app launch URL
    const appUrl = app._links?.appLinks?.[0]?.href || 
                   `https://fcxdemo.okta.com/home/${app.name}/${app.id}/alnk`;
    window.open(appUrl, '_blank', 'noopener,noreferrer');
  };

  const logoUrl = app.logoUrl ||
                  app._links?.logo?.[0]?.href || 
                  `https://op1static.oktacdn.com/assets/img/logos/default.6770228fb0dab250a8556360d72fcebabde7696e.png`;

  return (
    <div 
      onClick={handleClick}
      className="group cursor-pointer bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all duration-200 text-center"
    >
      <div className="mb-3 flex justify-center">
        <img 
          src={logoUrl}
          alt={app.label || app.name}
          className="w-12 h-12 rounded-lg object-contain"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23374151'><rect width='24' height='24' fill='%23f3f4f6'/><text x='12' y='16' text-anchor='middle' font-family='Arial' font-size='10' fill='%23374151'>${(app.label || app.name)[0].toUpperCase()}</text></svg>`;
          }}
        />
      </div>
      <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
        {app.label || app.name}
      </h3>
      <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500 mx-auto mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function OktaAssistantChat({ user }: { user: User }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello ${user.name}! I'm your Okta Assistant. ${
        user.role === 'super_admin' ? 
          `As a Super Admin, I can help you with:\n\n• **User Management**: Create, modify, and deactivate users\n• **Application Management**: Configure apps and assignments\n• **Governance Workflows**: Set up access reviews and campaigns\n• **Policy Administration**: Configure authentication and authorization policies\n• **Bulk Operations**: Mass user updates and group management\n• **Compliance Reporting**: Generate detailed audit reports\n• **API Integration**: Manage Okta APIs and integrations\n• **Advanced Admin Operations**: System-wide configurations\n\nWhat administrative task would you like to work on?` :
        user.role === 'app_owner' ? 
          `As an App Owner, I can help you with:\n\n• **Application Management**: Configure and manage your assigned applications\n• **User Assignments**: Add/remove users from your applications\n• **Access Requests**: Review and approve requests for your apps\n• **Governance Tasks**: Set up access reviews for your applications\n• **Reporting**: Generate reports for your managed applications\n\nWhat would you like to manage today?` :
          `I can help you with:\n\n• **Access Requests**: Request access to applications you need\n• **Application Usage**: Get help with your assigned applications\n• **Profile Management**: Update your profile information\n• **Self-Service Tasks**: Manage your own access and settings\n\nWhat can I help you with today?`
      }`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userMessage })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please check your network and try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div key={index} className={`${message.role === 'user' ? 'ml-4' : 'mr-4'}`}>
            <div className={`p-3 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-600 text-white ml-auto max-w-[80%]' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <pre className="whitespace-pre-wrap text-sm font-sans">{message.content}</pre>
            </div>
          </div>
        ))}
        {loading && (
          <div className="mr-4">
            <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="animate-pulse flex space-x-1">
                  <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                  <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                  <div className="rounded-full bg-gray-400 h-2 w-2"></div>
                </div>
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about access, governance, or admin tasks..."
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            rows={2}
            disabled={loading}
          />
          <Button 
            onClick={sendMessage} 
            disabled={!input.trim() || loading}
            size="sm"
            className="self-end"
          >
            Send
          </Button>
        </div>
      </div>
    </>
  );
}

export default function SimpleDashboard() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simple fetch without React Query
    fetch('/api/auth/user', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const userData = await res.json();
          console.log('User data received:', userData);
          setUser(userData);
        } else {
          console.log('Auth failed:', res.status);
          setError(`Auth failed: ${res.status}`);
        }
      })
      .catch((err) => {
        console.error('Fetch error:', err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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

  const refreshRole = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/refresh-role', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Role refreshed:', data.oldRole, '→', data.newRole);
        setUser(data.user);
      } else {
        console.error('Role refresh failed');
      }
    } catch (error) {
      console.error('Role refresh error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center p-8 bg-white rounded-lg shadow max-w-md">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Authentication Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => setLocation('/')} className="mr-2">
            Back to Login
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-yellow-50">
        <div className="text-center p-8 bg-white rounded-lg shadow max-w-md">
          <h2 className="text-xl font-semibold text-yellow-600 mb-4">No User Data</h2>
          <p className="text-gray-600 mb-4">Authentication succeeded but no user data received</p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-semibold">O</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Okta Enterprise Portal</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-blue-600 font-medium capitalize">{user.role.replace('_', ' ')}</p>
              </div>
              <Button onClick={refreshRole} variant="outline" size="sm" className="mr-2">
                Refresh Role
              </Button>
              <Button onClick={handleSignOut} variant="outline" size="sm">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Okta Style Layout */}
      <div className="flex flex-1">
        {/* Applications Dashboard */}
        <div className="flex-1 px-6 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">My Apps</h2>
            <p className="text-gray-600">Click any app to launch</p>
          </div>
          
          {/* Okta Applications - Real Data */}
          <OktaApplicationsGrid user={user} />
        </div>

        {/* AI Assistant Sidebar */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <h3 className="text-lg font-semibold text-blue-900 mb-1">Okta Assistant</h3>
            <p className="text-sm text-blue-700">Access Level: {user.role.replace('_', ' ').toUpperCase()}</p>
          </div>
          
          <OktaAssistantChat user={user} />
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ExternalLink, Grid, Monitor } from "lucide-react";

interface User {
  id: number;
  name: string;
  role: string;
  email: string;
  allRoles?: string[];
  groups?: string[];
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
  // Check if iframe mode should be enabled by default
  const defaultIframeMode = import.meta.env.VITE_DEFAULT_IFRAME_MODE === 'true';
  const [showIframe, setShowIframe] = useState(defaultIframeMode);

  useEffect(() => {
    // Skip API fetch if iframe mode is enabled by default
    if (defaultIframeMode) {
      setLoading(false);
      return;
    }

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
  }, [defaultIframeMode]);

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
    // Get Okta domain from environment or use default
    const oktaDomain = import.meta.env.VITE_OKTA_DOMAIN || 'fcxdemo.okta.com';
    
    return (
      <div className="h-full">
        <iframe
          src={`https://${oktaDomain}/app/UserHome`}
          className="w-full h-[600px] border border-gray-200 rounded-lg"
          title="Okta Applications"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
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

  if (apps.length === 0 && !showIframe) {
    return (
      <div className="text-center py-12">
        <div className="mb-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Grid className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600 mb-4">No applications are currently assigned to your account.</p>
        </div>
        <div className="flex justify-center space-x-3">
          <Button onClick={() => setShowIframe(true)} variant="default">
            <Monitor size={16} className="mr-2" />
            Open Okta Portal
          </Button>
          <Button onClick={() => window.location.reload()} variant="outline">
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Showing {apps.length} applications
        </div>
        <div className="flex space-x-2">
          <Button 
            onClick={() => setShowIframe(false)} 
            variant={!showIframe ? "default" : "outline"} 
            size="sm"
            className="flex items-center space-x-2"
          >
            <Grid size={16} />
            <span>Grid View</span>
          </Button>
          <Button 
            onClick={() => setShowIframe(true)} 
            variant={showIframe ? "default" : "outline"} 
            size="sm"
            className="flex items-center space-x-2"
          >
            <Monitor size={16} />
            <span>Okta Portal</span>
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
        {apps.map((app) => (
          <OktaApplicationTile key={app.id} app={app} />
        ))}
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
      id: 'welcome',
      role: 'assistant',
      content: `Hello ${user.name}! I'm your AI-powered Okta Assistant with continuous learning. ${
        user.role === 'super_admin' ? 
          `As a Super Admin, I can help you with:\n\n• **User Management**: Create, modify, and deactivate users\n• **Application Management**: Configure apps and assignments\n• **Governance Workflows**: Set up access reviews and campaigns\n• **Policy Administration**: Configure authentication and authorization policies\n• **Bulk Operations**: Mass user updates and group management\n• **Compliance Reporting**: Generate detailed audit reports\n• **API Integration**: Manage Okta APIs and integrations\n• **Advanced Admin Operations**: System-wide configurations\n• **30-Day Access Review**: Review and clean up unused application access\n\nWhat administrative task would you like to work on?` :
        user.role === 'app_owner' ? 
          `As an Administrator, I can help you with:\n\n• **Show My Apps**: View applications you own and their status\n• **Governance Campaigns**: Create access review campaigns for your apps\n• **User Access Reviews**: Review who has access to your applications\n• **Access Requests**: Review and approve requests for your apps\n• **30-Day Cleanup**: Review applications you haven't used recently\n• **Compliance Reporting**: Generate reports for your managed applications\n${user.allRoles?.some(role => role.includes('Group')) ? '\n• **Group Management**: Manage group memberships and view group details\n• **Group Operations**: List groups you can manage, add/remove users' : ''}\n\n**Quick Actions:**\n- Say "show my apps" to see applications you own\n- Say "30-day review" to see unused applications\n- Say "create campaign" to start governance reviews\n${user.allRoles?.some(role => role.includes('Group')) ? '\n- Say "show my groups" to see groups you can manage\n- Say "list groups" to view manageable groups' : ''}\n\nWhat would you like to manage today?` :
        user.role === 'group_admin' ?
          `As a Group Membership Administrator, I can help you with:\n\n• **Group Management**: Manage group memberships and view group details\n• **Group Operations**: List groups you can manage, add/remove users\n• **User Assignment**: Add and remove users from groups\n• **Group Analytics**: View group statistics and membership counts\n• **30-Day Cleanup**: Review unused access across managed groups\n• **Compliance Reporting**: Generate group membership reports\n\n**Quick Actions:**\n- Say "show my groups" to see groups you can manage\n- Say "list groups" to view manageable groups\n- Say "30-day review" to see unused applications\n\nWhat group management task would you like to work on?` :
          `I can help you with:\n\n• **Access Requests**: Request access to applications you need\n• **Application Usage**: Get help with your assigned applications\n• **Profile Management**: Update your profile information\n• **Self-Service Tasks**: Manage your own access and settings\n\nWhat can I help you with today?`
      }`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, string>>({});

  // Auto-load 30-day review on component mount
  useEffect(() => {
    const autoLoad30DayReview = async () => {
      console.log('Auto-loading 30-day access review...');
      setLoading(true);
      
      try {
        // Try the dedicated governance endpoint first
        const response = await fetch('/api/governance/30-day-review', {
          method: 'GET',
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          console.log('30-day review data:', data);
          
          let reviewContent = '**📊 30-Day Access Review**\n\n';
          
          if (data && data.length > 0) {
            reviewContent += `Found ${data.length} applications to review:\n\n`;
            data.forEach((app: any, index: number) => {
              reviewContent += `${index + 1}. **${app.applicationName || app.name}**\n`;
              reviewContent += `   Last accessed: ${app.lastAccessedDate || 'Unknown'}\n`;
              reviewContent += `   Days since access: ${app.daysSinceAccess || 'Unknown'}\n\n`;
            });
            reviewContent += '\n**Recommendations:**\n';
            reviewContent += '• Consider revoking access to applications not used in 30+ days\n';
            reviewContent += '• Review applications with "Never accessed" status\n';
            reviewContent += '• Verify access to critical applications is appropriate\n\n';
            reviewContent += '*Say "revoke access to [app name]" to remove unused access*';
          } else {
            reviewContent += '✅ **All Clear!**\n\n';
            reviewContent += 'You have accessed all your assigned applications within the last 30 days.\n';
            reviewContent += 'Your access appears to be actively used and appropriate.\n\n';
            reviewContent += '*This is excellent security hygiene!*';
          }
          
          setMessages(prev => [...prev, 
            { id: `auto-review-${Date.now()}`, role: 'assistant', content: reviewContent }
          ]);
        } else {
          console.error('30-day review API failed:', response.status);
          // Fallback to chat endpoint
          const fallbackResponse = await fetch('/api/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message: 'Show me my 30-day access review' })
          });
          
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            setMessages(prev => [...prev, 
              { id: `fallback-review-${Date.now()}`, role: 'assistant', content: fallbackData.response }
            ]);
          }
        }
      } catch (error) {
        console.error('Auto 30-day review error:', error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant', 
          content: '**📊 30-Day Access Review**\n\n❌ Unable to load review data at this time.\n\nThis could be due to:\n• API rate limits\n• Temporary connectivity issues\n• Authentication token refresh needed\n\n*Try asking "30-day review" manually or refresh the page.*'
        }]);
      } finally {
        setLoading(false);
      }
    };

    // Delay to let the component mount completely
    const timer = setTimeout(autoLoad30DayReview, 2000);
    return () => clearTimeout(timer);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      console.log('Sending chat message:', userMessage);
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userMessage })
      });

      console.log('Chat response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Chat response data:', data);
        const responseId = `assistant-${Date.now()}`;
        setMessages(prev => [...prev, { id: responseId, role: 'assistant', content: data.response }]);
      } else {
        const errorData = await response.text();
        console.error('Chat error response:', response.status, errorData);
        setMessages(prev => [...prev, { 
          id: `error-${Date.now()}`,
          role: 'assistant', 
          content: `Error ${response.status}: ${errorData}. Please try signing in again or refreshing the page.` 
        }]);
      }
    } catch (error) {
      console.error('Chat request failed:', error);
      setMessages(prev => [...prev, { id: `connection-error-${Date.now()}`, role: 'assistant', content: 'Connection error. Please check your network and try again.' }]);
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

  const handleFeedback = async (messageId: string, feedback: 'positive' | 'negative') => {
    try {
      const interactionId = document.cookie
        .split('; ')
        .find(row => row.startsWith('last_interaction_id='))
        ?.split('=')[1];

      if (!interactionId) {
        console.warn('No interaction ID found for feedback');
        return;
      }

      const response = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          interactionId, 
          feedback, 
          messageId 
        })
      });

      if (response.ok) {
        setFeedbackStatus(prev => ({ ...prev, [messageId]: feedback }));
        console.log(`✅ Feedback recorded: ${feedback}`);
      }
    } catch (error) {
      console.error('Failed to record feedback:', error);
    }
  };

  return (
    <>
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div key={message.id || index} className={`${message.role === 'user' ? 'ml-4' : 'mr-4'}`}>
            <div className={`p-3 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-600 text-white ml-auto max-w-[80%]' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <pre className="whitespace-pre-wrap text-sm font-sans">{message.content}</pre>
              
              {/* Feedback buttons for assistant messages */}
              {message.role === 'assistant' && message.id !== 'welcome' && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200">
                  <span className="text-xs text-gray-500">Helpful?</span>
                  <button 
                    onClick={() => handleFeedback(message.id!, 'positive')}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      feedbackStatus[message.id!] === 'positive' 
                        ? 'bg-green-200 text-green-800' 
                        : 'bg-green-100 hover:bg-green-200 text-green-700'
                    }`}
                    title="Good response"
                  >
                    👍 {feedbackStatus[message.id!] === 'positive' ? 'Thanks!' : ''}
                  </button>
                  <button 
                    onClick={() => handleFeedback(message.id!, 'negative')}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      feedbackStatus[message.id!] === 'negative' 
                        ? 'bg-red-200 text-red-800' 
                        : 'bg-red-100 hover:bg-red-200 text-red-700'
                    }`}
                    title="Needs improvement"
                  >
                    👎 {feedbackStatus[message.id!] === 'negative' ? 'Noted!' : ''}
                  </button>
                </div>
              )}
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
              <h1 className="text-xl font-semibold text-gray-900">Okta AI Dashboard</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <div className="flex flex-wrap gap-1 justify-end">
                  {user.allRoles && user.allRoles.length > 0 ? (
                    user.allRoles.map((role, index) => (
                      <span
                        key={index}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          role === 'Super Admin' 
                            ? 'bg-purple-100 text-purple-800' 
                            : role.includes('Admin') 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        title={role === 'Group Membership Admin' ? 'Can manage group memberships' : ''}
                      >
                        {role}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                      {user.role.replace('_', ' ')}
                    </span>
                  )}
                </div>
                {user.allRoles?.some(role => role.includes('Group')) && (
                  <p className="text-xs text-gray-500 mt-1">
                    Can manage groups in Okta
                  </p>
                )}
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
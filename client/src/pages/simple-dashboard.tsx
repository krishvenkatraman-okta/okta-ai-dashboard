import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ExternalLink, BarChart3 } from "lucide-react";
import { GovernanceWidgets } from "@/components/governance-widgets";
import { AdvancedGovernanceDashboard } from "@/components/advanced-governance-dashboard";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  groups: string[];
}

interface OktaApp {
  id: string;
  name: string;
  label: string;
  linkUrl?: string;
  logoUrl?: string;
  status: string;
}

function OktaApplicationsGrid({ user }: { user: User }) {
  const [apps, setApps] = useState<OktaApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/okta/user-apps', { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const appsData = await res.json();
          console.log('Apps data received:', appsData);
          setApps(appsData.apps || []);
        } else {
          console.log('Apps fetch failed:', res.status);
          setError(`Failed to load apps: ${res.status}`);
        }
      })
      .catch((err) => {
        console.error('Apps fetch error:', err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading your applications...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No applications available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {apps.map((app) => (
        <div
          key={app.id}
          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => {
            if (app.linkUrl) {
              window.open(app.linkUrl, '_blank');
            }
          }}
        >
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              {app.logoUrl ? (
                <img src={app.logoUrl} alt={app.label} className="w-8 h-8 rounded" />
              ) : (
                <span className="text-blue-600 font-semibold text-lg">
                  {app.label?.charAt(0) || app.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">
                {app.label || app.name}
              </h3>
              <p className="text-xs text-gray-500 truncate">
                Status: {app.status}
              </p>
            </div>
            {app.linkUrl && (
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GovernanceChatPanel() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Welcome to the Okta AI Assistant! 🤖

I can help you with:
• 30-day access reviews and compliance tracking
• Access request submissions with automatic form completion
• Governance campaign creation and management
• User and application management tasks
• Policy compliance monitoring

Try asking me:
- "Show me a 30-day access review"
- "I need access to Salesforce"
- "Create a governance review campaign"
- "What apps haven't been used recently?"

What would you like to do today?`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<{[key: string]: 'positive' | 'negative'}>({});

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: input })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, { 
          id: `assistant-${Date.now()}`, 
          role: 'assistant', 
          content: data.response 
        }]);
      } else {
        throw new Error(`Server error: ${response.status}`);
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
  const [showAdvancedDashboard, setShowAdvancedDashboard] = useState(false);

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
                <p className="text-xs text-blue-600 font-medium capitalize">{user.role.replace('_', ' ')}</p>
              </div>
              <Button 
                onClick={() => setShowAdvancedDashboard(!showAdvancedDashboard)}
                variant="outline" 
                size="sm" 
                className="mr-2"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                {showAdvancedDashboard ? 'Simple View' : 'Advanced View'}
              </Button>
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
          {/* Governance Insights Widgets */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Governance Insights</h2>
            <p className="text-gray-600 mb-4">Real-time governance metrics and compliance data</p>
            <GovernanceWidgets userId={user.id.toString()} userRole={user.role} />
          </div>

          {/* Advanced Dashboard Toggle */}
          {showAdvancedDashboard && (
            <div className="mb-8">
              <AdvancedGovernanceDashboard userRole={user.role} />
            </div>
          )}
          
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
            <h3 className="font-semibold text-gray-900">🤖 AI Assistant</h3>
            <p className="text-sm text-gray-600">Intelligent governance support</p>
          </div>
          
          <GovernanceChatPanel />
        </div>
      </div>
    </div>
  );
}
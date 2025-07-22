import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, User, Bot, Calendar, ShieldCheck, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AdminSessionHandler from "./admin-session-handler";
import { GovernanceAuthHandler } from "./governance-auth-handler";
import { AdminOAuthHandler } from "./admin-oauth-handler";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: any;
}

interface GovernanceChatProps {
  user: {
    name: string;
    role: string;
    allRoles?: string[];
  };
}

export default function GovernanceChat({ user }: GovernanceChatProps) {
  const [message, setMessage] = useState('');
  const getRoleDisplayName = (user: any) => {
    // For custom roles, show the custom role name prominently
    if (user.allRoles && user.allRoles.length > 0) {
      // Check for custom roles (formatted role names like "Sap Group Admins")
      const customRoles = user.allRoles.filter((role: string) => 
        !['Super Admin', 'App Admin', 'Group Admin', 'User Admin', 'Help Desk Admin', 'Read Only Admin', 'Mobile Admin', 'API Access Admin', 'Report Admin', 'Group Membership Admin'].includes(role)
      );
      
      if (customRoles.length > 0) {
        return customRoles[0].toUpperCase(); // Show first custom role prominently
      }
      
      // If no custom roles, show highest standard role
      if (user.allRoles.includes('Super Admin')) return 'SUPER ADMIN';
      if (user.allRoles.includes('App Admin')) return 'APP ADMIN';
      if (user.allRoles.includes('Group Admin') || user.allRoles.includes('Group Membership Admin')) return 'GROUP ADMIN';
    }
    
    // Fallback to role-based detection
    switch (user.role) {
      case 'super_admin': return 'SUPER ADMIN';
      case 'app_owner': return 'APP ADMIN'; 
      case 'group_admin': return 'GROUP ADMIN';
      case 'regular_user': return 'REGULAR USER';
      default: return 'USER';
    }
  };

  const getAccessLevelMessage = (user: any) => {
    const roleDisplay = getRoleDisplayName(user);
    
    // Handle custom roles
    if (user.allRoles && user.allRoles.length > 0) {
      const customRoles = user.allRoles.filter((role: string) => 
        !['Super Admin', 'App Admin', 'Group Admin', 'User Admin', 'Help Desk Admin', 'Read Only Admin', 'Mobile Admin', 'API Access Admin', 'Report Admin', 'Group Membership Admin'].includes(role)
      );
      
      if (customRoles.length > 0) {
        // Custom role with group management access
        if (customRoles[0].toLowerCase().includes('group')) {
          return `**Access Level: ${roleDisplay}**\n\nYou have custom group management access. I can help you with:\n• Manage groups and group memberships\n• Review group access across applications\n• Add/remove users from groups\n• Show your manageable groups`;
        }
        
        // Generic custom role
        return `**Access Level: ${roleDisplay}**\n\nYou have custom administrative access. I can help you with:\n• Manage resources within your scope\n• Review access to assigned resources\n• Request access to additional applications`;
      }
    }
    
    // Handle standard roles
    switch (user.role) {
      case 'super_admin':
        return `**Access Level: ${roleDisplay}**\n\nYou have full administrative access. I can help you with:\n• Create governance campaigns for any application\n• Review user access across all applications\n• Manage users and groups\n• Access all administrative features`;
      case 'app_owner':
        return `**Access Level: ${roleDisplay}**\n\nYou can manage applications you own. I can help you with:\n• Create governance campaigns for your applications\n• Review access to your applications\n• Request access to other applications`;
      case 'group_admin':
        return `**Access Level: ${roleDisplay}**\n\nYou can manage groups. I can help you with:\n• Manage group memberships\n• Review group access\n• Show your manageable groups`;
      case 'regular_user':
        return `**Access Level: ${roleDisplay}**\n\nI can help you with:\n• Review your own application access\n• Request access to new applications\n• View your access history`;
      default:
        return `**Access Level: LIMITED**\n\nI can help you request access to applications you need for your work.`;
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hi ${user.name}! I'm your Okta Assistant powered by AI.\n\n${getAccessLevelMessage(user)}\n\n**Quick Actions:**\n• "Show me apps I accessed in the last 30 days"\n• "List available applications to request"\n• "Show my groups"\n• "What can I do with my current access level?"\n\nHow can I help you today?`,
      timestamp: new Date(),
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiRequest('/api/chat/message', 'POST', { message }),
    onSuccess: (response: any) => {
      console.log('📥 Raw response received:', response);
      const responseData = response.data || response;
      console.log('🔍 Processed response data:', JSON.stringify(responseData, null, 2));
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: responseData.response || 'I processed your request.',
        timestamp: new Date(),
        data: responseData.data || responseData  // Ensure data is properly nested
      };
      console.log('💬 Assistant message created:', JSON.stringify(assistantMessage, null, 2));
      console.log('🔍 Message data for rendering:', assistantMessage.data);
      setMessages(prev => [...prev, assistantMessage]);
      
      // Handle admin session flows
      if (responseData.requiresAdminAuth) {
        if (responseData.action === 'admin_oauth_flow') {
          console.log('🔐 Starting admin OAuth flow');
          // Delay slightly to let UI update first
          setTimeout(() => handleAdminOAuthFlow(), 500);
        } else if (responseData.adminUrl) {
          console.log('🔐 Admin auth required, redirecting to:', responseData.adminUrl);
          window.open(responseData.adminUrl, '_blank', 'width=1024,height=768,scrollbars=yes,resizable=yes');
        }
      }
      
      // Handle governance authentication requirement
      if (responseData.requiresGovernanceAuth) {
        console.log('🏛️ Governance authentication required');
        // The UI will handle this via the needsGovernanceAuth check in renderMessage
      }
      
      // Invalidate related queries if data was updated
      queryClient.invalidateQueries({ queryKey: ['/api/governance/apps'] });
      queryClient.invalidateQueries({ queryKey: ['/api/catalog/entries'] });
    },
    onError: (error) => {
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessageMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(message.trim());
    setMessage('');
  };

  const handleQuickAction = (action: string) => {
    setMessage(action);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: action,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate(action);
  };

  const handleAdminOAuthFlow = async () => {
    try {
      console.log('🔐 Initiating admin OAuth flow');
      
      // Get admin auth URL from backend
      const response = await fetch('/api/auth/admin-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get admin auth URL');
      }
      
      const data = await response.json();
      console.log('🔐 Received admin auth data:', data);
      const { adminAuthUrl } = data;
      
      if (!adminAuthUrl) {
        throw new Error('No admin auth URL received from server');
      }
      
      console.log('🔐 Opening admin dashboard:', adminAuthUrl);
      
      // Open admin dashboard in new window/tab
      const adminWindow = window.open(
        adminAuthUrl, 
        'okta_admin_dashboard', 
        'width=1200,height=800,scrollbars=yes,resizable=yes,status=yes,toolbar=no,menubar=no'
      );
      
      if (!adminWindow) {
        throw new Error('Popup blocked! Please allow popups for this site and try again.');
      }
      
      console.log('🔐 Admin dashboard opened successfully');
      
      // Show instructions to user instead of waiting for popup messages
      const instructionsMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '🔐 **Admin Dashboard Opened**\n\n**Instructions:**\n1. Complete admin authentication in the opened window\n2. Navigate through the admin dashboard (this establishes your admin session)\n3. Return to this window and click "Confirm Admin Session" below\n\n**This ensures proper audit logging for all admin operations.**',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, instructionsMessage]);
      
      // Add confirm button after a delay
      setTimeout(() => {
        const confirmMessage: ChatMessage = {
          id: Date.now().toString() + '_confirm',
          role: 'assistant',
          content: '**Ready to continue?**\n\nAfter completing authentication in the admin dashboard, click below to confirm your admin session.',
          timestamp: new Date(),
          data: {
            action: 'confirm_admin_session',
            requiresAdminAuth: true
          }
        };
        setMessages(prev => [...prev, confirmMessage]);
      }, 2000);
      
    } catch (error) {
      console.error('Admin OAuth flow error:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Unable to start admin authentication**\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease refresh the page and try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';
    
    // Check if message requires admin session (check both data level and response level)
    const needsAdminAuth = msg.data?.requiresAdminAuth;
    const needsGovernanceAuth = msg.data?.action === 'governance_auth_required' || msg.data?.requiresGovernanceAuth;
    const needsAdminOAuth = msg.data?.action === 'admin_oauth_required';
    const hasAdminAction = msg.data?.action === 'admin_oauth_flow';
    
    // Debug logging
    if (msg.data) {
      console.log('📊 Message data debug:', {
        action: msg.data.action,
        requiresGovernanceAuth: msg.data.requiresGovernanceAuth,
        needsGovernanceAuth,
        needsAdminOAuth,
        hasAdminAction,
        messageContent: msg.content.substring(0, 100) + '...',
        fullData: msg.data
      });
    } else {
      console.log('📊 No message data found for message:', msg.content.substring(0, 100) + '...');
    }
    
    // Handle governance authentication requirement
    if (needsGovernanceAuth) {
      console.log('🏛️ Governance auth required - rendering handler with auto-initiate');
      return (
        <div className="mr-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-100 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <pre className="whitespace-pre-wrap text-sm font-sans mb-3">{msg.content}</pre>
            <GovernanceAuthHandler
              autoInitiate={true}
              onAuthSuccess={() => {
                // Refresh the chat or re-trigger the original request
                const successMessage: ChatMessage = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: '✅ **Governance Authentication Successful!**\n\nYou now have access to the governance catalog and can make access requests.\n\nTry asking to "show my apps" or "request access to [application name]" again.',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMessage]);
              }}
              onAuthError={(error) => {
                const errorMessage: ChatMessage = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: `❌ **Governance Authentication Failed**\n\nError: ${error}\n\nPlease try again or contact your administrator for governance access.`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMessage]);
              }}
            />
          </div>
        </div>
      );
    }
    
    // Handle admin OAuth authentication requirement
    if (needsAdminOAuth) {
      return (
        <div className="mr-4">
          <div className="bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100 p-3 rounded-lg border border-red-200 dark:border-red-800">
            <pre className="whitespace-pre-wrap text-sm font-sans mb-3">{msg.content}</pre>
            <AdminOAuthHandler
              autoInitiate={true}
              onAuthSuccess={() => {
                const successMessage: ChatMessage = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: '✅ **Admin OAuth Authentication Successful!**\n\nYou now have admin privileges with proper OAuth tokens for:\n• Group management operations\n• User administration\n• Governance administration\n\nTry your admin command again.',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMessage]);
              }}
              onAuthError={(error) => {
                const errorMessage: ChatMessage = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: `❌ **Admin OAuth Authentication Failed**\n\nError: ${error}\n\nPlease try again or contact your administrator for admin OAuth access.`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMessage]);
              }}
            />
          </div>
        </div>
      );
    }
    
    if (needsAdminAuth) {
      return (
        <div className="mr-4">
          <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-sans mb-3">{msg.content}</pre>
            
            {/* Check if this is a confirm admin session message */}
            {msg.data?.action === 'confirm_admin_session' ? (
              <Button 
                onClick={async () => {
                  console.log('🔐 Confirming admin session...');
                  try {
                    const response = await fetch('/api/auth/admin-confirm', {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' }
                    });
                    
                    if (response.ok) {
                      const successMessage: ChatMessage = {
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: '✅ **Admin Session Confirmed!**\n\nYou now have admin privileges for the next hour.\n\n**Available Actions:**\n• View and manage groups\n• Perform admin operations\n• Access elevated features\n\nTry your previous command again.',
                        timestamp: new Date(),
                      };
                      setMessages(prev => [...prev, successMessage]);
                    } else {
                      throw new Error('Failed to confirm admin session');
                    }
                  } catch (error) {
                    const errorMessage: ChatMessage = {
                      id: Date.now().toString(),
                      role: 'assistant',
                      content: `❌ **Admin Session Confirmation Failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease ensure you completed authentication in the admin dashboard first.`,
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, errorMessage]);
                  }
                }}
                className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white"
                variant="default"
              >
                Confirm Admin Session
              </Button>
            ) : (
              <Button 
                onClick={() => {
                  console.log('🔐 Admin Session button clicked, starting admin authentication flow');
                  handleAdminOAuthFlow();
                }}
                className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                variant="default"
              >
                Start Admin Session
              </Button>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isUser ? 'bg-blue-600 ml-3' : 'bg-gray-200 mr-3'
          }`}>
            {isUser ? <User className="text-white" size={16} /> : <Bot className="text-gray-600" size={16} />}
          </div>
          
          <div className={`rounded-lg p-3 ${
            isUser 
              ? 'bg-blue-600 text-white' 
              : 'bg-white border border-gray-200 text-gray-900'
          }`}>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {msg.content}
            </div>
            
            {/* Render special UI for governance responses */}
            {!isUser && msg.data && (
              <div className="mt-3 space-y-2">
                {msg.data.apps && msg.data.apps.length > 0 && (
                  <div className="space-y-2">
                    {msg.data.apps.map((app: any) => (
                      <Card key={app.id} className="border border-gray-200">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{app.name}</h4>
                              <p className="text-xs text-gray-500">
                                Last accessed: {new Date(app.lastAccess).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleQuickAction(`keep access to ${app.name}`)}
                              >
                                <CheckCircle size={14} className="mr-1" />
                                Keep
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleQuickAction(`revoke access to ${app.name}`)}
                              >
                                <XCircle size={14} className="mr-1" />
                                Revoke
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {msg.data.entries && msg.data.entries.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900 text-sm">Available Resources:</h4>
                    {msg.data.entries.map((entry: any) => (
                      <Card key={entry.id} className="border border-gray-200">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium text-gray-900 text-sm">{entry.displayName || entry.name}</h5>
                              <p className="text-xs text-gray-500">{entry.description}</p>
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => handleQuickAction(`request access to ${entry.displayName || entry.name} with justification: needed for project work`)}
                            >
                              <ArrowRight size={14} className="mr-1" />
                              Request
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="text-xs opacity-70 mt-2">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getQuickActions = (role: string) => {
    const baseActions = ["Show me apps I accessed in the last 30 days"];
    
    switch (role) {
      case 'super_admin':
        return [
          ...baseActions,
          "Create a governance campaign",
          "Show all governance enabled applications",
          "List available resources for access requests"
        ];
      case 'group_admin':
        return [
          ...baseActions,
          "Show groups I can manage",
          "List groups",
          "List available resources for access requests"
        ];
      case 'app_owner':
        return [
          ...baseActions,
          "Create a campaign for my applications", 
          "Show applications I own",
          "List available resources for access requests",
          ...(user.allRoles?.some(role => role.includes('Group')) ? ["Show groups I can manage", "List groups"] : [])
        ];
      case 'regular_user':
        return [
          ...baseActions,
          "List available applications to request",
          "What access do I currently have?"
        ];
      default:
        return [
          "List available applications to request",
          "How do I get access to applications?"
        ];
    }
  };

  const quickActions = getQuickActions(user.role);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Okta Assistant</h2>
            <p className="text-sm text-gray-600">AI-powered with Llama 3.1 (Local)</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex flex-wrap gap-1">
              {user.allRoles && user.allRoles.length > 0 ? (
                user.allRoles.map((role, index) => (
                  <Badge 
                    key={index}
                    variant={role === 'Super Admin' ? 'default' : role.includes('Admin') ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    <ShieldCheck size={12} className="mr-1" />
                    {role}
                  </Badge>
                ))
              ) : (
                <Badge 
                  variant={user.role === 'super_admin' ? 'default' : user.role === 'app_owner' ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  <ShieldCheck size={12} className="mr-1" />
                  {getRoleDisplayName(user.role)}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <Button
              key={index}
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction(action)}
              className="text-xs"
            >
              {action}
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map(renderMessage)}
        {sendMessageMutation.isPending && (
          <div className="flex justify-start mb-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <Bot className="text-gray-600" size={16} />
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                  <span className="text-sm text-gray-600">Processing...</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about access reviews, campaigns, or governance..."
            className="flex-1"
            disabled={sendMessageMutation.isPending}
          />
          <Button 
            type="submit" 
            disabled={!message.trim() || sendMessageMutation.isPending}
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
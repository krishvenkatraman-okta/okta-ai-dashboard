import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, Shield, Gavel, Key, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type { User, McpResponse } from "@shared/schema";

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface OktaAssistantProps {
  user: User;
}

export default function OktaAssistant({ user }: OktaAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', '/api/chat/message', { message });
      return response.json() as Promise<McpResponse>;
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        addMessage('assistant', data.data.response || 'I processed your request.');
      } else {
        addMessage('assistant', data.error || 'Sorry, I encountered an error processing your request.');
      }
    },
    onError: () => {
      addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    }
  });

  const addMessage = (type: 'user' | 'assistant', content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    addMessage('user', inputValue);
    sendMessageMutation.mutate(inputValue);
    setInputValue('');
  };

  const handleQuickAction = (action: string) => {
    const actions: Record<string, string> = {
      governance: "Start an access certification campaign for application governance",
      pam: "Show me current privileged access management sessions",
      access: "Show pending access requests that need approval",
      users: "Help me manage user accounts and permissions",
      security: "Review security policies and authentication rules",
      reset: "Help me reset user passwords and unlock accounts", 
      unlock: "Show me locked user accounts that need assistance",
      groups: "Help me manage group memberships and permissions",
      request: "I need to request access to an application or resource",
      profile: "Help me update my profile information and settings"
    };
    
    const message = actions[action];
    if (message) {
      addMessage('user', message);
      sendMessageMutation.mutate(message);
    }
  };

  const getRoleCapabilities = () => {
    // Based on Okta admin roles and permissions
    switch (user.role) {
      case 'super_admin':
        return [
          '🔧 **System Administration**',
          '• Full organization configuration and settings',
          '• User lifecycle management (create, update, delete, suspend)',
          '• Group management and membership',
          '• Application integration and assignment',
          '• Security policies and authentication rules',
          '',
          '🛡️ **Security & Governance**',
          '• Access certifications and governance campaigns',
          '• Privileged access management (PAM) operations',
          '• Risk management and threat detection',
          '• Audit logs and compliance reporting',
          '',
          '🔑 **Advanced Features**',
          '• Identity governance workflows',
          '• API access management',
          '• Directory integration',
          '• Custom administrator roles'
        ];
      case 'app_owner':
        return [
          '📱 **Application Management**',
          '• Manage assigned applications',
          '• Configure app settings and policies',
          '• Review and approve app access requests',
          '• Monitor application usage and analytics',
          '',
          '👥 **User Management**',
          '• Assign/unassign users to applications',
          '• Manage application-specific groups',
          '• Review user access and permissions',
          '',
          '📊 **Reporting & Governance**',
          '• Run access certification campaigns',
          '• Generate application usage reports',
          '• Monitor compliance status'
        ];
      case 'read_only_admin':
        return [
          '👀 **Read-Only Access**',
          '• View user accounts and profiles',
          '• Review application assignments',
          '• Access system logs and reports',
          '• Monitor organization activity',
          '',
          '📋 **Reporting**',
          '• Generate usage reports',
          '• Export user and application data',
          '• View audit trails'
        ];
      case 'help_desk_admin':
        return [
          '🎧 **User Support**',
          '• Reset user passwords and unlock accounts',
          '• Manage user MFA factors',
          '• View and update user profiles',
          '• Troubleshoot login issues',
          '',
          '🔧 **Basic Administration**',
          '• Assign and unassign applications',
          '• Manage user group memberships',
          '• Suspend and reactivate accounts'
        ];
      case 'group_admin':
        return [
          '👥 **Group Management**',
          '• Create and manage groups',
          '• Assign users to groups',
          '• Configure group rules and policies',
          '• Manage group-based application access'
        ];
      case 'regular_user':
        return [
          '📱 **Self-Service**',
          '• View your assigned applications',
          '• Update your profile information',
          '• Manage your MFA settings',
          '• Request access to applications',
          '',
          '🔑 **Account Management**',
          '• Change password and security questions',
          '• Review your access permissions',
          '• View login history'
        ];
      default:
        return [
          '🔍 **Basic Access**',
          '• Request access to resources',
          '• View available applications',
          '• Contact administrator for assistance'
        ];
    }
  };

  useEffect(() => {
    // Initialize with welcome message
    const capabilities = getRoleCapabilities();
    const roleDisplay = user.role === 'super_admin' ? 'Super Administrator' : 
                       user.role === 'app_owner' ? 'App Owner' : 'User';
    
    const welcomeMessage = `Hello ${user.name.split(' ')[0]}! I'm your Okta Assistant. As a ${roleDisplay}, I can help you with:\n\n${capabilities.join('\n')}\n\nWhat would you like to do today?`;
    
    addMessage('assistant', welcomeMessage);
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getQuickActions = () => {
    const actions = [];

    // Actions based on admin role capabilities
    if (user.role === 'super_admin') {
      actions.push(
        { id: 'governance', label: 'Start Access Certification', icon: Gavel, color: 'blue' },
        { id: 'pam', label: 'Manage PAM Sessions', icon: Key, color: 'red' },
        { id: 'users', label: 'User Management', icon: UserPlus, color: 'green' },
        { id: 'security', label: 'Security Policies', icon: Shield, color: 'orange' }
      );
    } else if (user.role === 'app_owner') {
      actions.push(
        { id: 'governance', label: 'App Access Review', icon: Gavel, color: 'blue' },
        { id: 'access', label: 'Approve App Requests', icon: UserPlus, color: 'purple' }
      );
    } else if (user.role === 'help_desk_admin') {
      actions.push(
        { id: 'reset', label: 'Password Reset', icon: Key, color: 'blue' },
        { id: 'unlock', label: 'Unlock Accounts', icon: UserPlus, color: 'green' }
      );
    } else if (user.role === 'group_admin') {
      actions.push(
        { id: 'groups', label: 'Manage Groups', icon: UserPlus, color: 'blue' }
      );
    } else {
      actions.push(
        { id: 'request', label: 'Request Access', icon: UserPlus, color: 'blue' },
        { id: 'profile', label: 'Update Profile', icon: Shield, color: 'green' }
      );
    }

    return actions;
  };

  return (
    <div className="w-full bg-white shadow-lg border-l border-gray-200 flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-200 bg-[hsl(199,100%,38%)] text-white">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <Bot size={16} />
          </div>
          <div>
            <h3 className="font-semibold">Okta Assistant</h3>
            <p className="text-xs opacity-90">Powered by MCP Server</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${message.type === 'user' ? 'justify-end' : ''}`}
          >
            {message.type === 'assistant' && (
              <div className="w-8 h-8 bg-[hsl(199,100%,38%)] rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="text-white" size={14} />
              </div>
            )}
            
            <div className={`rounded-lg p-3 max-w-xs ${
              message.type === 'user' 
                ? 'okta-chat-user' 
                : 'okta-chat-bot'
            }`}>
              <p className="text-sm whitespace-pre-line">{message.content}</p>
            </div>
            
            {message.type === 'user' && (
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold">{user.name.split(' ').map(n => n[0]).join('').toUpperCase()}</span>
              </div>
            )}
          </div>
        ))}
        
        {sendMessageMutation.isPending && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-[hsl(199,100%,38%)] rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="text-white" size={14} />
            </div>
            <div className="okta-chat-bot">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500 px-2">Quick Actions:</p>
          {getQuickActions().map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                className={`w-full text-left p-3 rounded-lg text-sm border transition-colors ${
                  action.color === 'blue' ? 'bg-blue-50 hover:bg-blue-100 border-blue-200' :
                  action.color === 'green' ? 'bg-green-50 hover:bg-green-100 border-green-200' :
                  'bg-purple-50 hover:bg-purple-100 border-purple-200'
                }`}
              >
                <Icon className={`inline mr-2 ${
                  action.color === 'blue' ? 'text-blue-600' :
                  action.color === 'green' ? 'text-green-600' :
                  'text-purple-600'
                }`} size={16} />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat Input */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <Input 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything about Okta..."
            className="flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={sendMessageMutation.isPending}
          />
          <Button 
            onClick={handleSendMessage} 
            disabled={!inputValue.trim() || sendMessageMutation.isPending}
            className="bg-[hsl(199,100%,38%)] hover:bg-[hsl(199,100%,28%)]"
          >
            <Send size={16} />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2 flex items-center">
          <Shield className="mr-1" size={12} />
          Secure MCP connection active
        </p>
      </div>
    </div>
  );
}

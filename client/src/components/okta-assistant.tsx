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
      governance: "Start a new governance campaign",
      pam: "Show me current PAM sessions",
      access: "Show pending access requests"
    };
    
    const message = actions[action];
    if (message) {
      addMessage('user', message);
      sendMessageMutation.mutate(message);
    }
  };

  const getRoleCapabilities = () => {
    switch (user.role) {
      case 'super_admin':
        return [
          '• User and group management',
          '• Application governance campaigns',
          '• PAM session operations',
          '• Access request reviews',
          '• Security policy management'
        ];
      case 'app_owner':
        return [
          '• Manage your applications',
          '• Run governance campaigns',
          '• Review access requests',
          '• Application usage reports'
        ];
      case 'regular_user':
        return [
          '• Submit access requests',
          '• View your applications',
          '• Check access status',
          '• Update profile information'
        ];
      default:
        return ['• Submit access requests', '• View available resources'];
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
    const baseActions = [
      { id: 'access', label: 'Process Access Requests', icon: UserPlus, color: 'purple' }
    ];

    if (user.role === 'super_admin' || user.role === 'app_owner') {
      baseActions.unshift(
        { id: 'governance', label: 'Start Governance Campaign', icon: Gavel, color: 'blue' },
        { id: 'pam', label: 'View PAM Sessions', icon: Key, color: 'green' }
      );
    }

    return baseActions;
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

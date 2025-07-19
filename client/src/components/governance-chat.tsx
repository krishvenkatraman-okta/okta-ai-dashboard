import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, User, Bot, Calendar, ShieldCheck, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  };
}

export default function GovernanceChat({ user }: GovernanceChatProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `👋 Hi ${user.name}! I'm your Okta Governance Assistant. I can help you with:\n\n• **Access Reviews**: "Show me apps I've accessed in the last 30 days"\n• **Governance Campaigns**: "Create a campaign for Salesforce every 3 months"\n• **Access Requests**: "Show me available resources to request"\n• **Admin Operations**: Based on your ${user.role} permissions\n\nWhat would you like to do?`,
      timestamp: new Date(),
    }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const sendMessageMutation = useMutation({
    mutationFn: (message: string) => apiRequest('/api/chat/message', 'POST', { message }),
    onSuccess: (response) => {
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response.data?.response || 'I processed your request.',
        timestamp: new Date(),
        data: response.data
      };
      setMessages(prev => [...prev, assistantMessage]);
      
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

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === 'user';
    
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

  const quickActions = [
    "Show me apps I accessed in the last 30 days",
    "List available resources for access requests", 
    "Create a campaign for Salesforce every 3 months",
    "Show governance enabled applications"
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Okta Assistant</h2>
            <p className="text-sm text-gray-600">AI-powered governance and access management</p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              <ShieldCheck size={14} className="mr-1" />
              {user.role}
            </Badge>
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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Shield } from "lucide-react";

interface AdminSessionHandlerProps {
  adminUrl: string;
  intent: string;
  onSessionEstablished?: () => void;
}

export default function AdminSessionHandler({ adminUrl, intent, onSessionEstablished }: AdminSessionHandlerProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authStatus, setAuthStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  const handleAdminAuth = async () => {
    setIsAuthenticating(true);
    setAuthStatus('pending');

    try {
      // Open admin portal in new window
      const adminWindow = window.open(adminUrl, 'oktaAdmin', 'width=800,height=600,scrollbars=yes,resizable=yes');
      
      if (!adminWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Poll for session token from admin window
      const pollForToken = () => {
        try {
          // Try to access admin window's session storage
          const sessionToken = adminWindow.sessionStorage?.getItem('okta-session-token');
          
          if (sessionToken) {
            // Store session token
            fetch('/api/auth/admin-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ sessionToken })
            }).then(response => {
              if (response.ok) {
                setAuthStatus('success');
                adminWindow.close();
                onSessionEstablished?.();
              } else {
                throw new Error('Failed to store session token');
              }
            }).catch(error => {
              console.error('Session storage error:', error);
              setAuthStatus('error');
            });
          } else if (adminWindow.closed) {
            setAuthStatus('error');
            setIsAuthenticating(false);
          } else {
            // Continue polling
            setTimeout(pollForToken, 1000);
          }
        } catch (error) {
          // Continue polling if we can't access the window yet
          if (!adminWindow.closed) {
            setTimeout(pollForToken, 1000);
          } else {
            setAuthStatus('error');
            setIsAuthenticating(false);
          }
        }
      };

      // Start polling after a brief delay
      setTimeout(pollForToken, 2000);

    } catch (error) {
      console.error('Admin auth error:', error);
      setAuthStatus('error');
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-start space-x-3">
        <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-blue-900 mb-2">Admin Session Required</h3>
          <p className="text-sm text-blue-700 mb-3">
            To perform <span className="font-medium">{intent.replace('_', ' ')}</span> operations, you need to authenticate with the Okta admin portal.
          </p>
          
          {authStatus === 'idle' && (
            <Button 
              onClick={handleAdminAuth}
              disabled={isAuthenticating}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Start Admin Session
            </Button>
          )}

          {authStatus === 'pending' && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-3">
                <p className="text-sm text-blue-800">
                  🔄 Waiting for admin authentication... Please complete the login in the popup window.
                </p>
              </CardContent>
            </Card>
          )}

          {authStatus === 'success' && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-3">
                <p className="text-sm text-green-800">
                  ✅ Admin session established! You can now perform administrative operations.
                </p>
              </CardContent>
            </Card>
          )}

          {authStatus === 'error' && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-3">
                <p className="text-sm text-red-800">
                  ❌ Admin authentication failed. Please try again.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
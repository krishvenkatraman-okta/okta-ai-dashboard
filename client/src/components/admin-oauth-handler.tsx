import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react';

interface AdminOAuthHandlerProps {
  onAuthSuccess: () => void;
  onAuthError: (error: string) => void;
  autoInitiate?: boolean;
}

export function AdminOAuthHandler({ onAuthSuccess, onAuthError, autoInitiate = false }: AdminOAuthHandlerProps) {
  const [authState, setAuthState] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Listen for messages from the OAuth popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'ADMIN_OAUTH_SUCCESS') {
        setAuthState('success');
        setTimeout(() => {
          onAuthSuccess();
        }, 1000);
      } else if (event.data.type === 'ADMIN_OAUTH_ERROR') {
        setAuthState('error');
        setErrorMessage(event.data.error || 'Authentication failed');
        onAuthError(event.data.error || 'Authentication failed');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess, onAuthError]);

  // Auto-initiate OAuth flow if requested
  useEffect(() => {
    if (autoInitiate && authState === 'idle') {
      handleAdminOAuth();
    }
  }, [autoInitiate, authState]);

  const handleAdminOAuth = async () => {
    try {
      setAuthState('authenticating');
      setErrorMessage('');

      // Get the admin OAuth URL
      const response = await fetch('/api/admin/auth-url', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get admin OAuth URL');
      }

      const data = await response.json();
      
      if (data.action === 'admin_already_authenticated') {
        setAuthState('success');
        onAuthSuccess();
        return;
      }

      if (data.authUrl) {
        // Open popup for OAuth flow
        const popup = window.open(
          data.authUrl,
          'admin-oauth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        if (!popup) {
          throw new Error('Failed to open authentication popup. Please allow popups for this site.');
        }

        // Check if popup was closed manually
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            if (authState === 'authenticating') {
              setAuthState('error');
              setErrorMessage('Authentication was cancelled');
              onAuthError('Authentication was cancelled');
            }
          }
        }, 1000);
      }
    } catch (error) {
      setAuthState('error');
      const message = error instanceof Error ? error.message : 'Authentication failed';
      setErrorMessage(message);
      onAuthError(message);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-950/20">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
            Admin OAuth Authentication Required
          </h3>
          <p className="text-sm text-red-800 dark:text-red-200 mb-4">
            To perform admin operations, you need to authenticate with Okta's dedicated admin app 
            that provides elevated permissions for group management and admin operations.
          </p>
          
          {authState === 'idle' && !autoInitiate && (
            <Button 
              onClick={handleAdminOAuth}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Authenticate with Admin OAuth
            </Button>
          )}
          
          {authState === 'idle' && autoInitiate && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Automatically initiating admin OAuth authentication...</span>
            </div>
          )}
          
          {authState === 'authenticating' && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Authenticating with admin OAuth system...</span>
            </div>
          )}
          
          {authState === 'success' && (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Admin OAuth authentication successful!</span>
            </div>
          )}
          
          {authState === 'error' && (
            <Alert className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      
      {authState === 'idle' && (
        <div className="mt-3 text-xs text-red-700 dark:text-red-300">
          <strong>Admin OAuth Scopes:</strong>
          <ul className="list-disc list-inside mt-1 ml-2">
            <li>okta.governance.read / okta.governance.manage</li>
            <li>okta.groups.manage / okta.groups.read</li>
            <li>okta.users.manage / okta.users.read</li>
          </ul>
        </div>
      )}
    </div>
  );
}
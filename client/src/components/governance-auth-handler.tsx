import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, CheckCircle, AlertCircle } from 'lucide-react';

interface GovernanceAuthHandlerProps {
  onAuthSuccess: () => void;
  onAuthError: (error: string) => void;
  autoInitiate?: boolean;
}

export function GovernanceAuthHandler({ onAuthSuccess, onAuthError, autoInitiate = false }: GovernanceAuthHandlerProps) {
  const [authState, setAuthState] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Listen for messages from the OAuth popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'GOVERNANCE_AUTH_SUCCESS') {
        setAuthState('success');
        setTimeout(() => {
          onAuthSuccess();
        }, 1000);
      } else if (event.data.type === 'GOVERNANCE_AUTH_ERROR') {
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
      console.log('🔄 Auto-initiating governance OAuth flow...');
      setTimeout(() => {
        handleGovernanceAuth();
      }, 500); // Small delay to ensure UI is ready
    }
  }, [autoInitiate, authState]);

  const handleGovernanceAuth = async () => {
    try {
      setAuthState('authenticating');
      setErrorMessage('');

      // Get the governance auth URL
      const response = await fetch('/api/governance/auth-url', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to get governance auth URL');
      }

      const data = await response.json();
      
      if (data.action === 'governance_already_authenticated') {
        setAuthState('success');
        onAuthSuccess();
        return;
      }

      if (data.authUrl) {
        // Open popup for OAuth flow
        const popup = window.open(
          data.authUrl,
          'governance-auth',
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
    <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
      <div className="flex items-start gap-3">
        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Governance Authentication Required
          </h3>
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
            To access the application catalog and make access requests, you need to authenticate 
            with Okta's governance system using dedicated permissions.
          </p>
          
          {authState === 'idle' && !autoInitiate && (
            <Button 
              onClick={handleGovernanceAuth}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Shield className="h-4 w-4 mr-2" />
              Authenticate for Governance
            </Button>
          )}
          
          {authState === 'idle' && autoInitiate && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Automatically initiating governance authentication...</span>
            </div>
          )}
          
          {authState === 'authenticating' && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Authenticating with governance system...</span>
            </div>
          )}
          
          {authState === 'success' && (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Governance authentication successful!</span>
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
        <div className="mt-3 text-xs text-blue-700 dark:text-blue-300">
          <strong>Required Scopes:</strong>
          <ul className="list-disc list-inside mt-1 ml-2">
            <li>okta.accessRequests.catalog.read</li>
            <li>okta.accessRequests.request.manage</li>
            <li>okta.accessRequests.request.read</li>
          </ul>
        </div>
      )}
    </div>
  );
}
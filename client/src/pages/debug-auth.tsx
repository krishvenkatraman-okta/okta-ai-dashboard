import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function DebugAuth() {
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [cookies, setCookies] = useState<string>('');

  useEffect(() => {
    // Check auth status
    fetch('/api/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(setAuthStatus)
      .catch(console.error);

    // Check user info
    fetch('/api/auth/user', { credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error(`${res.status}: ${res.statusText}`);
      })
      .then(setUserInfo)
      .catch(err => setUserInfo({ error: err.message }));

    // Get cookies
    setCookies(document.cookie);
  }, []);

  const testLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug</h1>
      
      <div className="space-y-6">
        <div className="bg-white p-4 rounded border">
          <h2 className="text-lg font-semibold mb-2">Auth Status</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify(authStatus, null, 2)}
          </pre>
        </div>

        <div className="bg-white p-4 rounded border">
          <h2 className="text-lg font-semibold mb-2">User Info</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify(userInfo, null, 2)}
          </pre>
        </div>

        <div className="bg-white p-4 rounded border">
          <h2 className="text-lg font-semibold mb-2">Cookies</h2>
          <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
            {cookies || 'No cookies found'}
          </pre>
        </div>

        <Button onClick={testLogin}>Test Login</Button>
      </div>
    </div>
  );
}
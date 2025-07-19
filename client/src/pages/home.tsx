import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Check } from "lucide-react";
import { SiOkta } from "react-icons/si";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is already authenticated
    fetch('/api/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setLocation('/dashboard');
        }
      })
      .catch(() => {
        // User not authenticated, stay on home page
      });
  }, [setLocation]);

  const handleSignIn = () => {
    // Redirect to backend OIDC auth endpoint
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(199,100%,38%)] to-[hsl(199,100%,28%)]">
      <Card className="w-full max-w-md mx-4 shadow-2xl">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="bg-[hsl(199,100%,38%)] rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Shield className="text-white text-2xl" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Okta Enterprise Portal</h1>
            <p className="text-gray-600">Secure access to your enterprise applications and governance tools</p>
          </div>
          
          <div className="space-y-4">
            <Button onClick={handleSignIn} className="okta-button w-full">
              <SiOkta size={20} />
              <span>Sign in with Okta</span>
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-gray-500">
                Connecting to: <span className="font-medium">fcxdemo.okta.com</span>
              </p>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="text-center text-sm text-gray-500">
              <p className="mb-2">Features include:</p>
              <ul className="space-y-1">
                <li className="flex items-center justify-center">
                  <Check className="text-[hsl(199,100%,38%)] mr-2" size={16} />
                  Role-based access controls
                </li>
                <li className="flex items-center justify-center">
                  <Check className="text-[hsl(199,100%,38%)] mr-2" size={16} />
                  AI-powered governance assistant
                </li>
                <li className="flex items-center justify-center">
                  <Check className="text-[hsl(199,100%,38%)] mr-2" size={16} />
                  Access request management
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

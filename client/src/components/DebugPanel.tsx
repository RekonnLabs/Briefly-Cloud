import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface DebugPanelProps {
  userProfile: any;
  storageConnections: any;
  isAuthenticated: boolean;
}

export default function DebugPanel({ userProfile, storageConnections, isAuthenticated }: DebugPanelProps) {
  const [apiTests, setApiTests] = useState<Record<string, any>>({});
  const [isVisible, setIsVisible] = useState(false);

  const testEndpoints = async () => {
    const endpoints = [
      '/api/storage/status',
      '/api/chat/history',
      '/api/embed/status',
      '/health'
    ];

    const results: Record<string, any> = {};
    const token = localStorage.getItem('supabase_token');

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        
        const data = await response.json();
        results[endpoint] = {
          status: response.status,
          ok: response.ok,
          data: data
        };
      } catch (error) {
        results[endpoint] = {
          status: 'ERROR',
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    setApiTests(results);
  };

  useEffect(() => {
    if (isAuthenticated) {
      testEndpoints();
    }
  }, [isAuthenticated]);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsVisible(true)}
          className="bg-red-100 border-red-300 text-red-800"
        >
          Debug Panel
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-4 z-50 bg-black/50 flex items-center justify-center">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Debug Panel</CardTitle>
              <CardDescription>Application state and API status</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Authentication Status */}
          <div>
            <h3 className="font-medium mb-2">Authentication</h3>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                {isAuthenticated ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-red-500" />}
                <span>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</span>
              </div>
              <div>Token: {localStorage.getItem('supabase_token') ? 'Present' : 'Missing'}</div>
            </div>
          </div>

          {/* User Profile */}
          <div>
            <h3 className="font-medium mb-2">User Profile</h3>
            <div className="text-sm">
              {userProfile ? (
                <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(userProfile, null, 2)}
                </pre>
              ) : (
                <span className="text-gray-500">No user profile loaded</span>
              )}
            </div>
          </div>

          {/* Storage Connections */}
          <div>
            <h3 className="font-medium mb-2">Storage Connections</h3>
            <div className="text-sm">
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                {JSON.stringify(storageConnections, null, 2)}
              </pre>
            </div>
          </div>

          {/* API Tests */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">API Endpoints</h3>
              <Button size="sm" onClick={testEndpoints}>
                <Loader2 className="h-4 w-4 mr-1" />
                Retest
              </Button>
            </div>
            <div className="space-y-2">
              {Object.entries(apiTests).map(([endpoint, result]) => (
                <div key={endpoint} className="border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm">{endpoint}</span>
                    <Badge variant={result.ok ? "default" : "destructive"}>
                      {result.status}
                    </Badge>
                  </div>
                  {result.error && (
                    <div className="text-xs text-red-600 mb-1">
                      Error: {result.error}
                    </div>
                  )}
                  {result.data && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600">Response Data</summary>
                      <pre className="bg-gray-50 p-1 mt-1 rounded overflow-x-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Console Errors */}
          <div>
            <h3 className="font-medium mb-2">Console Errors</h3>
            <div className="text-xs text-gray-600">
              Check browser console (F12) for JavaScript errors
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
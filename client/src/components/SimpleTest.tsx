import React, { useState, useEffect } from 'react';

export default function SimpleTest() {
  const [authStatus, setAuthStatus] = useState('checking...');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('supabase_token');
      console.log('SimpleTest: Token exists:', !!token);
      
      if (!token) {
        setAuthStatus('No token found');
        return;
      }

      console.log('SimpleTest: Making profile request...');
      const response = await fetch('/api/auth/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('SimpleTest: Profile response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('SimpleTest: Profile data:', data);
        setUserProfile(data);
        setAuthStatus('authenticated');
      } else {
        const errorText = await response.text();
        console.error('SimpleTest: Profile error:', response.status, errorText);
        setError(`Profile request failed: ${response.status} - ${errorText}`);
        setAuthStatus('error');
      }
    } catch (err) {
      console.error('SimpleTest: Exception:', err);
      setError(`Exception: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setAuthStatus('error');
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'white',
      minHeight: '100vh'
    }}>
      <h1>Simple Auth Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <strong>Auth Status:</strong> {authStatus}
      </div>

      {error && (
        <div style={{ 
          backgroundColor: '#ffebee', 
          border: '1px solid #f44336', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {userProfile && (
        <div style={{ 
          backgroundColor: '#e8f5e8', 
          border: '1px solid #4caf50', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>User Profile:</strong>
          <pre style={{ marginTop: '10px', fontSize: '12px' }}>
            {JSON.stringify(userProfile, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <button onClick={checkAuth} style={{ 
          padding: '8px 16px', 
          backgroundColor: '#2196f3', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Retry Auth Check
        </button>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p>This component tests the authentication flow in isolation.</p>
        <p>Check the browser console for detailed logs.</p>
      </div>
    </div>
  );
}
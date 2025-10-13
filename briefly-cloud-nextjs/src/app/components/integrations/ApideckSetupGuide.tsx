'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Copy, ExternalLink } from 'lucide-react';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'completed' | 'error';
  details?: string;
}

export function ApideckSetupGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const setupSteps: SetupStep[] = [
    {
      id: 'signup',
      title: 'Sign up for Apideck',
      description: 'Create an account at apideck.com and get your API credentials',
      status: 'pending'
    },
    {
      id: 'app',
      title: 'Create an Application',
      description: 'In the Apideck dashboard, create a new application for your integration',
      status: 'pending'
    },
    {
      id: 'oauth',
      title: 'Configure OAuth Settings',
      description: 'Set up your redirect URI and enable the required scopes',
      status: 'pending'
    },
    {
      id: 'env',
      title: 'Set Environment Variables',
      description: 'Add your Apideck credentials to your environment configuration',
      status: 'pending'
    },
    {
      id: 'test',
      title: 'Test Integration',
      description: 'Verify that your Apideck integration is working correctly',
      status: 'pending'
    }
  ];

  const envVariables = [
    {
      name: 'APIDECK_ENABLED',
      value: 'true',
      description: 'Enable Apideck integration'
    },
    {
      name: 'APIDECK_API_KEY',
      value: 'sk_your_api_key_here',
      description: 'Your Apideck API key (starts with sk_)'
    },
    {
      name: 'APIDECK_APP_ID',
      value: 'app_your_app_id_here',
      description: 'Your Apideck App ID (starts with app_)'
    },
    {
      name: 'APIDECK_APP_UID',
      value: 'app_uid_your_app_uid_here',
      description: 'Your Apideck App UID (starts with app_uid_)'
    },
    {
      name: 'APIDECK_API_BASE_URL',
      value: 'https://unify.apideck.com',
      description: 'Apideck API base URL (do not change)'
    },
    {
      name: 'APIDECK_VAULT_BASE_URL',
      value: 'https://unify.apideck.com/vault',
      description: 'Apideck Vault base URL (do not change)'
    },
    {
      name: 'APIDECK_REDIRECT_URL',
      value: 'https://your-domain.com/api/integrations/apideck/callback',
      description: 'OAuth callback URL (must match your domain)'
    },
    {
      name: 'NEXT_PUBLIC_SITE_URL',
      value: 'https://your-domain.com',
      description: 'Your application base URL'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Apideck Integration Setup</h1>
        <p className="text-gray-300">
          Follow these steps to set up Apideck Vault for cloud storage integration
        </p>
      </div>

      {/* Setup Steps */}
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Setup Steps</h2>
        
        {setupSteps.map((step, index) => (
          <div key={step.id} className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white mb-2">{step.title}</h3>
                <p className="text-gray-300 mb-4">{step.description}</p>
                
                {step.id === 'signup' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-400">
                      Visit the Apideck website to create your account:
                    </p>
                    <a
                      href="https://apideck.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-blue-400 hover:text-blue-300"
                    >
                      <span>apideck.com</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
                
                {step.id === 'oauth' && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-400">
                      In your Apideck application settings, set the redirect URI to:
                    </p>
                    <div className="bg-gray-800 rounded p-3 font-mono text-sm text-green-400">
                      https://your-domain.com/api/integrations/apideck/callback
                    </div>
                    <p className="text-sm text-gray-400">
                      Enable the following scopes: File Storage (Google Drive, OneDrive)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Environment Variables */}
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Environment Variables</h2>
        <p className="text-gray-300">
          Add these environment variables to your <code className="bg-gray-800 px-2 py-1 rounded">.env.local</code> file:
        </p>
        
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg overflow-hidden">
          {envVariables.map((env, index) => (
            <div key={env.name} className={`p-4 ${index > 0 ? 'border-t border-gray-700/40' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <code className="text-blue-400 font-mono">{env.name}</code>
                <button
                  onClick={() => copyToClipboard(`${env.name}=${env.value}`, env.name)}
                  className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span className="text-xs">
                    {copied === env.name ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>
              <div className="bg-gray-800 rounded p-3 font-mono text-sm text-green-400 mb-2">
                {env.name}={env.value}
              </div>
              <p className="text-sm text-gray-400">{env.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testing */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Testing Your Setup</h2>
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-6">
          <p className="text-gray-300 mb-4">
            After setting up your environment variables, you can test your Apideck integration:
          </p>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-gray-300">Restart your development server</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-gray-300">Navigate to the Cloud Storage tab</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-gray-300">Click "Run Apideck Test" in the debug section</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-gray-300">Try connecting a cloud storage provider</span>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Common Issues</h2>
        <div className="space-y-4">
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-white mb-2">Authentication Error (40401)</h3>
                <p className="text-gray-300 text-sm mb-2">
                  This usually means your API credentials are incorrect or not set.
                </p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Check that your API key starts with "sk_"</li>
                  <li>• Verify your App ID starts with "app_"</li>
                  <li>• Ensure your App UID starts with "app_uid_"</li>
                  <li>• Make sure you're using the correct environment (staging vs production)</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-white mb-2">Redirect URI Mismatch</h3>
                <p className="text-gray-300 text-sm mb-2">
                  The redirect URI in your environment must exactly match what's configured in Apideck.
                </p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Check your Apideck application settings</li>
                  <li>• Ensure the domain matches exactly (including https://)</li>
                  <li>• The path must be /api/integrations/apideck/callback</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-white mb-2">Vault Script Not Loading</h3>
                <p className="text-gray-300 text-sm mb-2">
                  If the Apideck Vault modal doesn't open, the script might not be loaded.
                </p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Check browser console for script loading errors</li>
                  <li>• Verify the vault.js script is included in your layout</li>
                  <li>• Try refreshing the page</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
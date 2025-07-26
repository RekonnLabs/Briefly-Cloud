import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Cloud, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  FileText, 
  MessageSquare, 
  Settings,
  ExternalLink,
  Brain,
  Zap,
  Smartphone,
  Monitor,
  Download
} from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
  userProfile: any;
  storageConnections: any;
}

export default function OnboardingFlow({ onComplete, userProfile, storageConnections }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const hasConnectedStorage = storageConnections.google.connected || storageConnections.microsoft.connected;

  // Helper functions - defined early to avoid hoisting issues
  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-100 text-gray-800';
      case 'pro': return 'bg-blue-100 text-blue-800';
      case 'pro_byok': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTierName = (tier: string) => {
    switch (tier) {
      case 'free': return 'Free';
      case 'pro': return 'Pro';
      case 'pro_byok': return 'Pro (BYOK)';
      default: return tier;
    }
  };

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to Briefly Cloud!',
      description: 'Your AI-powered document assistant',
      content: (
        <div className="space-y-4 lg:space-y-6">
          <div className="text-center">
            <Cloud className="h-12 w-12 lg:h-16 lg:w-16 mx-auto mb-4 text-blue-600" />
            <h2 className="text-xl lg:text-2xl font-bold mb-2">Welcome to Briefly Cloud</h2>
            <p className="text-gray-600 mb-4 lg:mb-6 text-sm lg:text-base">
              Transform your documents into an intelligent knowledge base. 
              Chat with your files using AI and get instant answers.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
            <div className="text-center p-3 lg:p-4 border rounded-lg">
              <Cloud className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 text-blue-600" />
              <h3 className="font-medium mb-1 text-sm lg:text-base">Connect Storage</h3>
              <p className="text-xs lg:text-sm text-gray-600">Link Google Drive or OneDrive</p>
            </div>
            <div className="text-center p-3 lg:p-4 border rounded-lg">
              <Brain className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 text-green-600" />
              <h3 className="font-medium mb-1 text-sm lg:text-base">Index Documents</h3>
              <p className="text-xs lg:text-sm text-gray-600">AI processes your files</p>
            </div>
            <div className="text-center p-3 lg:p-4 border rounded-lg">
              <MessageSquare className="h-6 w-6 lg:h-8 lg:w-8 mx-auto mb-2 text-purple-600" />
              <h3 className="font-medium mb-1 text-sm lg:text-base">Chat & Search</h3>
              <p className="text-xs lg:text-sm text-gray-600">Ask questions about your docs</p>
            </div>
          </div>

          {/* Mobile app promotion */}
          <div className="lg:hidden mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Smartphone className="h-5 w-5 text-blue-600" />
              <h3 className="font-medium text-blue-800">Mobile Optimized</h3>
            </div>
            <p className="text-sm text-blue-700 mb-3">
              Briefly Cloud works great on mobile! Add it to your home screen for quick access.
            </p>
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <Download className="h-4 w-4" />
              <span>Tap "Add to Home Screen" in your browser menu</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'subscription',
      title: 'Your Plan',
      description: 'Understanding your subscription benefits',
      content: (
        <div className="space-y-4">
          <div className="text-center mb-4 lg:mb-6">
            <Badge className={getTierBadgeColor(userProfile?.subscription_tier || 'free')}>
              {formatTierName(userProfile?.subscription_tier || 'free')} Plan
            </Badge>
          </div>

          {userProfile?.subscription_tier === 'free' && (
            <div className="space-y-4">
              <div className="p-3 lg:p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-800 mb-2 text-sm lg:text-base">Free Plan Includes:</h3>
                <ul className="space-y-1 text-xs lg:text-sm text-blue-700">
                  <li>• Google Drive integration</li>
                  <li>• Up to 100 AI chat messages per month</li>
                  <li>• GPT-3.5 Turbo model</li>
                  <li>• Basic document indexing</li>
                </ul>
              </div>
              
              <div className="p-3 lg:p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
                <h3 className="font-medium text-purple-800 mb-2 text-sm lg:text-base">Upgrade to Pro for:</h3>
                <ul className="space-y-1 text-xs lg:text-sm text-purple-700">
                  <li>• OneDrive integration</li>
                  <li>• 10,000 AI chat messages per month</li>
                  <li>• GPT-4o model (latest & most capable)</li>
                  <li>• Priority processing</li>
                  <li>• Advanced features</li>
                </ul>
                <Button className="mt-3 w-full lg:w-auto" size="sm">
                  <Zap className="h-4 w-4 mr-1" />
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          )}

          {userProfile?.subscription_tier === 'pro' && (
            <div className="p-3 lg:p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-800 mb-2 text-sm lg:text-base">Pro Plan Benefits:</h3>
              <ul className="space-y-1 text-xs lg:text-sm text-green-700">
                <li>• Google Drive & OneDrive integration</li>
                <li>• 10,000 AI chat messages per month</li>
                <li>• GPT-4o model access</li>
                <li>• Priority processing & support</li>
              </ul>
            </div>
          )}

          {userProfile?.subscription_tier === 'pro_byok' && (
            <div className="p-3 lg:p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-800 mb-2 text-sm lg:text-base">Pro BYOK Plan:</h3>
              <ul className="space-y-1 text-xs lg:text-sm text-purple-700">
                <li>• All Pro features</li>
                <li>• Unlimited usage with your OpenAI API key</li>
                <li>• Full control over AI model selection</li>
                <li>• Enterprise-grade privacy</li>
              </ul>
              <p className="text-xs lg:text-sm text-purple-600 mt-2">
                Configure your OpenAI API key in Settings to get started.
              </p>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'storage',
      title: 'Connect Your Storage',
      description: 'Link your cloud storage to get started',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 mb-4 text-sm lg:text-base">
            Connect your cloud storage to start using Briefly Cloud. 
            We'll securely access your documents to create an AI-powered knowledge base.
          </p>

          <div className="space-y-3">
            {/* Google Drive */}
            <div className="flex items-center justify-between p-3 lg:p-4 border rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Cloud className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm lg:text-base">Google Drive</h3>
                  <p className="text-xs lg:text-sm text-gray-600 truncate">
                    {storageConnections.google.connected 
                      ? `Connected as ${storageConnections.google.email}`
                      : 'Access your Google Drive files'
                    }
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 ml-2">
                {storageConnections.google.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Button size="sm" variant="outline" className="text-xs">
                    <ExternalLink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                    <span className="hidden sm:inline">Connect</span>
                  </Button>
                )}
              </div>
            </div>

            {/* OneDrive */}
            <div className="flex items-center justify-between p-3 lg:p-4 border rounded-lg">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Cloud className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm lg:text-base">OneDrive</h3>
                  <p className="text-xs lg:text-sm text-gray-600 truncate">
                    {storageConnections.microsoft.connected 
                      ? `Connected as ${storageConnections.microsoft.email}`
                      : userProfile?.subscription_tier === 'free'
                        ? 'Requires Pro plan'
                        : 'Access your OneDrive files'
                    }
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 ml-2">
                {storageConnections.microsoft.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : userProfile?.subscription_tier === 'free' ? (
                  <Badge variant="outline" className="text-xs">Pro</Badge>
                ) : (
                  <Button size="sm" variant="outline" className="text-xs">
                    <ExternalLink className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                    <span className="hidden sm:inline">Connect</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {!hasConnectedStorage && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs lg:text-sm text-orange-800">
                You'll need to connect at least one storage provider to continue. 
                Use the Settings panel to set up your connections.
              </p>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'indexing',
      title: 'Index Your Documents',
      description: 'Prepare your files for AI-powered search',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 mb-4 text-sm lg:text-base">
            Once your storage is connected, you'll need to index your documents. 
            This process analyzes your files and creates an AI-searchable knowledge base.
          </p>

          <div className="space-y-3">
            <div className="p-3 lg:p-4 border rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600" />
                <h3 className="font-medium text-sm lg:text-base">Supported File Types</h3>
              </div>
              <div className="grid grid-cols-2 gap-1 lg:gap-2 text-xs lg:text-sm text-gray-600">
                <div>• PDF documents</div>
                <div>• Word documents (.docx)</div>
                <div>• PowerPoint (.pptx)</div>
                <div>• Excel spreadsheets (.xlsx)</div>
                <div>• Text files (.txt)</div>
                <div>• JSON files</div>
              </div>
            </div>

            <div className="p-3 lg:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-2 text-sm lg:text-base">What happens during indexing:</h3>
              <ul className="space-y-1 text-xs lg:text-sm text-blue-700">
                <li>1. We scan your connected storage for supported files</li>
                <li>2. Extract text content from each document</li>
                <li>3. Break content into searchable chunks</li>
                <li>4. Create AI embeddings for semantic search</li>
                <li>5. Store everything securely in your private knowledge base</li>
              </ul>
            </div>

            {hasConnectedStorage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Ready to index!
                  </span>
                </div>
                <p className="text-xs lg:text-sm text-green-700 mt-1">
                  Your storage is connected. Click "Index Documents" in the main chat to start.
                </p>
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'chat',
      title: 'Start Chatting',
      description: 'Ask questions about your documents',
      content: (
        <div className="space-y-4">
          <p className="text-gray-600 mb-4 text-sm lg:text-base">
            Once your documents are indexed, you can start chatting! 
            Ask questions about your files and get AI-powered answers with source citations.
          </p>

          <div className="space-y-3">
            <div className="p-3 lg:p-4 border rounded-lg">
              <h3 className="font-medium mb-2 text-sm lg:text-base">Example Questions:</h3>
              <div className="space-y-2 text-xs lg:text-sm text-gray-600">
                <div className="p-2 bg-gray-50 rounded text-xs lg:text-sm">
                  "What are the key findings in my research report?"
                </div>
                <div className="p-2 bg-gray-50 rounded text-xs lg:text-sm">
                  "Summarize the budget projections from my spreadsheet"
                </div>
                <div className="p-2 bg-gray-50 rounded text-xs lg:text-sm">
                  "Find all mentions of 'quarterly goals' in my documents"
                </div>
                <div className="p-2 bg-gray-50 rounded text-xs lg:text-sm">
                  "What action items were discussed in the meeting notes?"
                </div>
              </div>
            </div>

            <div className="p-3 lg:p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-800 mb-2 text-sm lg:text-base">Pro Tips:</h3>
              <ul className="space-y-1 text-xs lg:text-sm text-green-700">
                <li>• Be specific in your questions for better results</li>
                <li>• Ask for summaries, comparisons, or specific details</li>
                <li>• Check the source citations to verify information</li>
                <li>• Use follow-up questions to dive deeper</li>
              </ul>
            </div>

            {/* Mobile-specific tips */}
            <div className="lg:hidden p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <h3 className="font-medium text-purple-800 mb-2 text-sm">Mobile Tips:</h3>
              <ul className="space-y-1 text-xs text-purple-700">
                <li>• Swipe to access the menu</li>
                <li>• Tap and hold messages to copy text</li>
                <li>• Use voice input for hands-free chatting</li>
                <li>• Add to home screen for quick access</li>
              </ul>
            </div>
          </div>

          <div className="text-center pt-4">
            <Button onClick={onComplete} size="lg" className="w-full lg:w-auto">
              <MessageSquare className="h-4 w-4 mr-2" />
              Start Chatting
            </Button>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex space-x-1 lg:space-x-2">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs lg:text-sm text-gray-500">
              {currentStep + 1} of {steps.length}
            </span>
          </div>
          <CardTitle className="text-lg lg:text-xl">{currentStepData.title}</CardTitle>
          <CardDescription className="text-sm lg:text-base">{currentStepData.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStepData.content}
          
          <div className="flex justify-between mt-6 gap-3">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="flex-1 lg:flex-none"
            >
              <ArrowLeft className="h-4 w-4 mr-1 lg:mr-2" />
              <span className="hidden sm:inline">Previous</span>
              <span className="sm:hidden">Back</span>
            </Button>
            
            {currentStep < steps.length - 1 ? (
              <Button onClick={nextStep} className="flex-1 lg:flex-none">
                <span className="hidden sm:inline">Next</span>
                <span className="sm:hidden">Next</span>
                <ArrowRight className="h-4 w-4 ml-1 lg:ml-2" />
              </Button>
            ) : (
              <Button onClick={onComplete} variant="outline" className="flex-1 lg:flex-none">
                <span className="hidden sm:inline">Skip to Chat</span>
                <span className="sm:hidden">Skip</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


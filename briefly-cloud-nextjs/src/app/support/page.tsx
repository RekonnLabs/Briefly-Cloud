'use client'

import { useState } from 'react'
import { useAuth } from '@/app/components/auth/SupabaseAuthProvider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { Badge } from '@/app/components/ui/badge'
import { 
  MessageCircle, 
  Phone, 
  Mail, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Send,
  FileText,
  HelpCircle,
  ExternalLink
} from 'lucide-react'

interface SupportTicket {
  id: string
  subject: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
}

export default function SupportPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'contact' | 'tickets' | 'faq'>('contact')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium' as const,
    category: 'migration' as const,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setSubmitSuccess(true)
        setFormData({
          subject: '',
          description: '',
          priority: 'medium',
          category: 'migration',
        })
      } else {
        throw new Error('Failed to submit ticket')
      }
    } catch (error) {
      console.error('Failed to submit ticket:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const faqItems = [
    {
      question: 'How long does the migration take?',
      answer: 'Most migrations complete within 15-30 minutes. Larger accounts with many documents may take up to 2 hours. You\'ll receive notifications throughout the process.',
      category: 'migration'
    },
    {
      question: 'Will I lose any data during migration?',
      answer: 'No, your data is completely safe. We create backups before migration and only proceed after validation. If any issues occur, we can restore from backup.',
      category: 'migration'
    },
    {
      question: 'I can\'t access my documents after migration',
      answer: 'This is usually a temporary issue. Try refreshing the page or clearing your browser cache. If the problem persists, contact support with your account details.',
      category: 'technical'
    },
    {
      question: 'My chat history is missing',
      answer: 'Chat history is migrated separately and may take a few minutes to appear. If it doesn\'t appear within 1 hour, please contact support.',
      category: 'technical'
    },
    {
      question: 'How do I update my subscription?',
      answer: 'You can update your subscription in the billing section of your account. Go to Settings > Billing to manage your plan.',
      category: 'billing'
    },
    {
      question: 'What file types are supported?',
      answer: 'We support PDF, DOCX, XLSX, PPTX, TXT, MD, and CSV files. Files must be under 50MB for free users and 100MB for pro users.',
      category: 'technical'
    }
  ]

  const troubleshootingSteps = [
    {
      title: 'Clear Browser Cache',
      description: 'Clear your browser cache and cookies, then refresh the page.',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      title: 'Check Internet Connection',
      description: 'Ensure you have a stable internet connection.',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      title: 'Try Different Browser',
      description: 'Try accessing the app from a different browser.',
      icon: <CheckCircle className="h-4 w-4" />
    },
    {
      title: 'Check Migration Status',
      description: 'Visit the migration status page to check if your data is still being processed.',
      icon: <CheckCircle className="h-4 w-4" />
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Support Center
          </h1>
          <p className="text-gray-600">
            Get help with migration issues, technical problems, or general questions
          </p>
        </div>

        {/* Contact Methods */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <h3 className="font-semibold">Live Chat</h3>
                  <p className="text-sm text-gray-600">Instant help</p>
                </div>
              </div>
              <Button className="w-full" asChild>
                <a href="#chat">Start Chat</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Mail className="h-8 w-8 text-green-500" />
                <div>
                  <h3 className="font-semibold">Email Support</h3>
                  <p className="text-sm text-gray-600">support@rekonnlabs.com</p>
                </div>
              </div>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:support@rekonnlabs.com">Send Email</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Phone className="h-8 w-8 text-purple-500" />
                <div>
                  <h3 className="font-semibold">Phone Support</h3>
                  <p className="text-sm text-gray-600">Mon-Fri, 9AM-6PM EST</p>
                </div>
              </div>
              <Button variant="outline" className="w-full" asChild>
                <a href="tel:+1-555-0123">Call Now</a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Support Options</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button
                    variant={activeTab === 'contact' ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActiveTab('contact')}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Contact Support
                  </Button>
                  <Button
                    variant={activeTab === 'tickets' ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActiveTab('tickets')}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    My Tickets
                  </Button>
                  <Button
                    variant={activeTab === 'faq' ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setActiveTab('faq')}
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    FAQ & Help
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'contact' && (
              <Card>
                <CardHeader>
                  <CardTitle>Contact Support</CardTitle>
                  <CardDescription>
                    Submit a support ticket and we'll get back to you within 24 hours
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {submitSuccess && (
                    <Alert className="mb-6 border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Your support ticket has been submitted successfully. We'll respond within 24 hours.
                      </AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Category
                        </label>
                        <select
                          value={formData.category}
                          onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as any }))}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="migration">Migration Issue</option>
                          <option value="technical">Technical Problem</option>
                          <option value="billing">Billing Question</option>
                          <option value="feature">Feature Request</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Priority
                        </label>
                        <select
                          value={formData.priority}
                          onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Subject
                      </label>
                      <Input
                        value={formData.subject}
                        onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Brief description of your issue"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Description
                      </label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Please provide detailed information about your issue..."
                        rows={6}
                        required
                      />
                    </div>

                    <div className="flex gap-4">
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Submit Ticket
                          </>
                        )}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setActiveTab('faq')}>
                        Check FAQ First
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {activeTab === 'tickets' && (
              <Card>
                <CardHeader>
                  <CardTitle>My Support Tickets</CardTitle>
                  <CardDescription>
                    Track the status of your support requests
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {user ? (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No tickets found</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Your support tickets will appear here once submitted
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                      <p className="text-gray-600">Please sign in to view your tickets</p>
                      <Button className="mt-4" asChild>
                        <a href="/auth/signin">Sign In</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'faq' && (
              <div className="space-y-6">
                {/* FAQ Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Frequently Asked Questions</CardTitle>
                    <CardDescription>
                      Find answers to common questions about migration and the app
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {faqItems.map((item, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <h4 className="font-medium mb-2">{item.question}</h4>
                          <p className="text-sm text-gray-600">{item.answer}</p>
                          <Badge variant="outline" className="mt-2">
                            {item.category}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Troubleshooting Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Troubleshooting</CardTitle>
                    <CardDescription>
                      Try these steps before contacting support
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {troubleshootingSteps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                          <div className="text-green-500 mt-0.5">
                            {step.icon}
                          </div>
                          <div>
                            <h4 className="font-medium">{step.title}</h4>
                            <p className="text-sm text-gray-600">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Migration Status Link */}
                <Card>
                  <CardHeader>
                    <CardTitle>Migration Status</CardTitle>
                    <CardDescription>
                      Check the status of your data migration
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <a href="/briefly/app/migration-status">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Check Migration Status
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="mt-8">
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
                <div>
                  <h3 className="font-semibold">Emergency Support</h3>
                  <p className="text-sm text-gray-600">
                    For critical issues affecting your business, call our emergency line: +1-555-0124
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { Badge } from '@/app/components/ui/badge'
import { 
  MessageSquare, 
  X, 
  Send, 
  CheckCircle, 
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Bug,
  Lightbulb,
  Heart
} from 'lucide-react'

interface FeedbackData {
  type: 'bug' | 'feature' | 'migration' | 'general'
  rating?: 'positive' | 'negative' | 'neutral'
  title: string
  description: string
  email?: string
  userAgent?: string
  url?: string
}

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState<'feedback' | 'bug' | 'migration'>('feedback')
  const [formData, setFormData] = useState<FeedbackData>({
    type: 'general',
    title: '',
    description: '',
    email: '',
  })

  // Auto-detect if user is experiencing migration issues
  useEffect(() => {
    const checkMigrationIssues = () => {
      // Check for migration-related errors in console
      const hasMigrationErrors = window.location.pathname.includes('migration') ||
        document.title.includes('Migration') ||
        document.body.textContent?.includes('migration')
      
      if (hasMigrationErrors) {
        setActiveTab('migration')
        setFormData(prev => ({ ...prev, type: 'migration' }))
      }
    }

    checkMigrationIssues()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const feedbackData = {
        ...formData,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      })

      if (response.ok) {
        setSubmitSuccess(true)
        setFormData({
          type: 'general',
          title: '',
          description: '',
          email: '',
        })
        
        // Auto-close after 3 seconds
        setTimeout(() => {
          setIsOpen(false)
          setSubmitSuccess(false)
        }, 3000)
      } else {
        throw new Error('Failed to submit feedback')
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuickFeedback = async (rating: 'positive' | 'negative') => {
    try {
      const feedbackData = {
        type: 'general',
        rating,
        title: `Quick ${rating} feedback`,
        description: `User provided ${rating} feedback for ${window.location.pathname}`,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }

      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      })

      // Show success message
      setSubmitSuccess(true)
      setTimeout(() => {
        setSubmitSuccess(false)
      }, 2000)
    } catch (error) {
      console.error('Failed to submit quick feedback:', error)
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        {/* Quick Feedback Buttons */}
        <div className="flex gap-2 mb-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickFeedback('positive')}
            className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
          >
            <ThumbsUp className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickFeedback('negative')}
            className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
          >
            <ThumbsDown className="h-4 w-4" />
          </Button>
        </div>

        {/* Main Feedback Button */}
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-12 h-12 shadow-lg"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="w-96 shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Feedback</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Help us improve your experience
          </CardDescription>
        </CardHeader>

        <CardContent>
          {submitSuccess ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Thank you for your feedback! We'll review it shortly.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Tab Navigation */}
              <div className="flex gap-1 mb-4">
                <Button
                  variant={activeTab === 'feedback' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('feedback')}
                  className="flex-1"
                >
                  <Heart className="h-3 w-3 mr-1" />
                  General
                </Button>
                <Button
                  variant={activeTab === 'bug' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('bug')}
                  className="flex-1"
                >
                  <Bug className="h-3 w-3 mr-1" />
                  Bug
                </Button>
                <Button
                  variant={activeTab === 'migration' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab('migration')}
                  className="flex-1"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Migration
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Feedback Type */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    {activeTab === 'feedback' && (
                      <>
                        <option value="general">General Feedback</option>
                        <option value="feature">Feature Request</option>
                        <option value="bug">Bug Report</option>
                      </>
                    )}
                    {activeTab === 'bug' && (
                      <>
                        <option value="bug">Bug Report</option>
                        <option value="technical">Technical Issue</option>
                        <option value="performance">Performance Issue</option>
                      </>
                    )}
                    {activeTab === 'migration' && (
                      <>
                        <option value="migration">Migration Issue</option>
                        <option value="data_loss">Data Loss Concern</option>
                        <option value="performance">Slow Migration</option>
                        <option value="access">Can't Access Data</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Rating (for general feedback) */}
                {activeTab === 'feedback' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      How would you rate your experience?
                    </label>
                    <div className="flex gap-2">
                      {['negative', 'neutral', 'positive'].map((rating) => (
                        <Button
                          key={rating}
                          type="button"
                          variant={formData.rating === rating ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setFormData(prev => ({ ...prev, rating: rating as any }))}
                          className="flex-1"
                        >
                          {rating === 'positive' && <ThumbsUp className="h-3 w-3 mr-1" />}
                          {rating === 'negative' && <ThumbsDown className="h-3 w-3 mr-1" />}
                          {rating === 'neutral' && <span className="mr-1">○</span>}
                          {rating}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {activeTab === 'migration' ? 'Issue Summary' : 'Title'}
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={
                      activeTab === 'migration' 
                        ? 'Brief description of the migration issue'
                        : 'Brief description of your feedback'
                    }
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {activeTab === 'migration' ? 'Detailed Description' : 'Description'}
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={
                      activeTab === 'migration'
                        ? 'Please describe the migration issue in detail. Include any error messages, steps to reproduce, and what you expected to happen.'
                        : 'Please provide detailed information about your feedback...'
                    }
                    rows={4}
                    required
                  />
                </div>

                {/* Email (optional) */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email (optional)
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="your@email.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    We'll only use this to follow up on your feedback
                  </p>
                </div>

                {/* Migration-specific info */}
                {activeTab === 'migration' && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Migration Support:</strong> If this is urgent, please also contact our support team at{' '}
                      <a href="mailto:support@rekonnlabs.com" className="underline">
                        support@rekonnlabs.com
                      </a>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Submit Button */}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Submit Feedback
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

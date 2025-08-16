import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/lib/auth/supabase-auth'
import { logger } from '@/app/lib/logger'
import { formatErrorResponse } from '@/app/lib/api-errors'
import { withRateLimit } from '@/app/lib/rate-limit'
import { z } from 'zod'

// Feedback schemas
const FeedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'migration', 'general', 'data_loss', 'performance', 'access', 'technical']),
  rating: z.enum(['positive', 'negative', 'neutral']).optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(2000),
  email: z.string().email().optional(),
  userAgent: z.string().optional(),
  url: z.string().url().optional(),
  timestamp: z.string().datetime().optional(),
})

const GetFeedbackSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  type: z.enum(['bug', 'feature', 'migration', 'general']).optional(),
  rating: z.enum(['positive', 'negative', 'neutral']).optional(),
})

export async function POST(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      const body = await request.json()
      const feedbackData = FeedbackSchema.parse(body)

      // Create feedback record
      const feedback = {
        id: crypto.randomUUID(),
        user_id: session?.user?.id || null,
        type: feedbackData.type,
        rating: feedbackData.rating,
        title: feedbackData.title,
        description: feedbackData.description,
        email: feedbackData.email,
        user_agent: feedbackData.userAgent,
        url: feedbackData.url,
        created_at: feedbackData.timestamp || new Date().toISOString(),
        status: 'new',
      }

      // Store feedback in database (this would be implemented with your database)
      // For now, we'll log it and return success
      logger.info('Feedback submitted', {
        feedbackId: feedback.id,
        userId: feedback.user_id,
        type: feedback.type,
        rating: feedback.rating,
        title: feedback.title,
      })

      // Send notification for migration issues
      if (feedback.type === 'migration' || feedback.type === 'data_loss') {
        await sendMigrationIssueNotification(feedback)
      }

      // Send notification for critical bugs
      if (feedback.type === 'bug' && feedback.rating === 'negative') {
        await sendBugReportNotification(feedback)
      }

      return NextResponse.json({
        success: true,
        data: {
          feedback_id: feedback.id,
          message: 'Feedback submitted successfully'
        }
      })

    } catch (error) {
      logger.error('Failed to submit feedback', { error })
      return formatErrorResponse('Failed to submit feedback', 500)
    }
  })
}

export async function GET(request: NextRequest) {
  return withRateLimit(request, async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return formatErrorResponse('Unauthorized', 401)
      }

      // Check admin privileges for viewing all feedback
      const { data: user } = await fetch(`${process.env.NEXTAUTH_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }
      }).then(res => res.json())

      const { searchParams } = new URL(request.url)
      const query = {
        limit: parseInt(searchParams.get('limit') || '50'),
        offset: parseInt(searchParams.get('offset') || '0'),
        type: searchParams.get('type') || undefined,
        rating: searchParams.get('rating') || undefined,
      }

      const validatedQuery = GetFeedbackSchema.parse(query)

      // Get feedback from database
      // This would be implemented with your database
      const feedback = await getFeedback(session.user.id, validatedQuery, user?.is_admin)

      return NextResponse.json({
        success: true,
        data: {
          feedback,
          count: feedback.length,
        }
      })

    } catch (error) {
      logger.error('Failed to get feedback', { error })
      return formatErrorResponse('Failed to get feedback', 500)
    }
  })
}

// Helper functions (these would be implemented with your database)
async function getFeedback(userId: string, query: any, isAdmin: boolean) {
  // This would query your database for feedback
  // For now, return empty array
  return []
}

async function sendMigrationIssueNotification(feedback: any) {
  // Send notification to support team for migration issues
  logger.info('Migration issue notification sent', {
    feedbackId: feedback.id,
    type: feedback.type,
    title: feedback.title,
  })

  // This could send an email, Slack message, or create a support ticket
  // Example implementation:
  /*
  const emailContent = `
    Migration Issue Reported:
    - Type: ${feedback.type}
    - Title: ${feedback.title}
    - Description: ${feedback.description}
    - User Email: ${feedback.email}
    - URL: ${feedback.url}
  `
  
  await sendEmail('support@rekonnlabs.com', 'Migration Issue Reported', emailContent)
  */
}

async function sendBugReportNotification(feedback: any) {
  // Send notification to development team for bug reports
  logger.info('Bug report notification sent', {
    feedbackId: feedback.id,
    title: feedback.title,
    rating: feedback.rating,
  })

  // This could send an email, create a GitHub issue, or notify the dev team
  // Example implementation:
  /*
  const bugReport = `
    Bug Report:
    - Title: ${feedback.title}
    - Description: ${feedback.description}
    - User Agent: ${feedback.user_agent}
    - URL: ${feedback.url}
    - Rating: ${feedback.rating}
  `
  
  await createGitHubIssue('Bug Report', bugReport, 'bug')
  */
}

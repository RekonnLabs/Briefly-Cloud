import { z } from 'zod'

// File upload validation
export const fileUploadSchema = z.object({
  file: z.any(), // File object validation will be done separately
  userId: z.string().uuid(),
})

// Document embedding validation
export const embedRequestSchema = z.object({
  userId: z.string().uuid(),
  source: z.enum(['google', 'microsoft', 'upload']),
  fileIds: z.array(z.string()).optional(),
})

// Chat request validation
export const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  userId: z.string().uuid(),
})

// User profile validation
export const userProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  preferences: z.record(z.any()).optional(),
})

// Cloud storage connection validation
export const cloudStorageSchema = z.object({
  provider: z.enum(['google', 'microsoft']),
  userId: z.string().uuid(),
})

// Subscription update validation
export const subscriptionUpdateSchema = z.object({
  tier: z.enum(['free', 'pro', 'pro_byok']),
  userId: z.string().uuid(),
})

// API key validation (for BYOK)
export const apiKeySchema = z.object({
  apiKey: z.string().min(1),
  userId: z.string().uuid(),
})

// File metadata validation
export const fileMetadataSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().positive(),
  mimeType: z.string(),
  source: z.enum(['upload', 'google', 'microsoft']),
})

// Document chunk validation
export const documentChunkSchema = z.object({
  content: z.string().min(1),
  chunkIndex: z.number().nonnegative(),
  metadata: z.record(z.any()).optional(),
})

// Vector search validation
export const vectorSearchSchema = z.object({
  query: z.string().min(1).max(500),
  userId: z.string().uuid(),
  limit: z.number().positive().max(50).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.7),
})

// Job status validation
export const jobStatusSchema = z.object({
  jobId: z.string().uuid(),
  userId: z.string().uuid(),
})

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().positive().optional().default(1),
  limit: z.number().positive().max(100).optional().default(20),
})

// Error response schema
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
})

// Success response schema
export const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.any().optional(),
  message: z.string().optional(),
})

// Validation helper function
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ')
      return { success: false, error: errorMessage }
    }
    return { success: false, error: 'Validation failed' }
  }
}

// Middleware for request validation
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      const body = await request.json()
      const validation = validateRequest(schema, body)
      
      if (!validation.success) {
        return Response.json(
          { success: false, error: validation.error },
          { status: 400 }
        )
      }
      
      return handler(validation.data, request)
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
  }
}
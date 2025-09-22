/**
 * Complete user data interface including subscription and usage information
 */
export interface CompleteUserData {
  id: string
  email: string
  name?: string
  image?: string
  subscription_tier: 'free' | 'pro' | 'pro_byok'
  subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired'
  usage_count: number
  usage_limit: number
  trial_end_date?: string
  created_at: string
  updated_at: string
  // Additional fields from the existing User interface
  full_name?: string
  chat_messages_count: number
  chat_messages_limit: number
  documents_uploaded: number
  documents_limit: number
  api_calls_count: number
  api_calls_limit: number
  storage_used_bytes: number
  storage_limit_bytes: number
  usage_stats: Record<string, unknown>
  preferences: Record<string, unknown>
  features_enabled: Record<string, boolean>
  permissions: Record<string, boolean>
  usage_reset_date: string
}

/**
 * Result wrapper for user data operations with error handling
 */
export interface UserDataResult {
  user: CompleteUserData | null
  error?: UserDataError
}

/**
 * Typed error responses for user data operations
 */
export interface UserDataError {
  code: 'AUTH_REQUIRED' | 'USER_NOT_FOUND' | 'DATABASE_ERROR' | 'PERMISSION_DENIED' | 'INVALID_USER_ID' | 'NETWORK_ERROR'
  message: string
  details?: unknown
}

/**
 * Helper function to check if user data is valid and complete
 * 
 * @param user - User data to validate
 * @returns boolean - True if user data is valid
 */
export function isValidUserData(user: CompleteUserData | null): user is CompleteUserData {
  return !!(
    user &&
    user.id &&
    user.email &&
    user.subscription_tier &&
    user.subscription_status &&
    typeof user.usage_count === 'number' &&
    typeof user.usage_limit === 'number'
  )
}

/**
 * Helper function to get user-friendly error message
 * 
 * @param error - UserDataError to format
 * @returns string - User-friendly error message
 */
export function getUserDataErrorMessage(error: UserDataError): string {
  switch (error.code) {
    case 'AUTH_REQUIRED':
      return 'Please sign in to access your account data.'
    case 'USER_NOT_FOUND':
      return 'User account not found. Please contact support if this persists.'
    case 'DATABASE_ERROR':
      return 'Unable to load account data. Please try again later.'
    case 'PERMISSION_DENIED':
      return 'Access denied. Please check your account permissions.'
    case 'INVALID_USER_ID':
      return 'Invalid user account. Please sign in again.'
    case 'NETWORK_ERROR':
      return 'Network error. Please check your connection and try again.'
    default:
      return 'An unexpected error occurred. Please try again later.'
  }
}

/**
 * Helper function to create a safe user data object for client components
 * Removes sensitive information and ensures all required fields are present
 * 
 * @param user - Complete user data
 * @returns Sanitized user data safe for client-side use
 */
export function getSafeUserData(user: CompleteUserData | null) {
  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name || user.full_name,
    image: user.image,
    subscription_tier: user.subscription_tier,
    subscription_status: user.subscription_status,
    usage_count: user.usage_count,
    usage_limit: user.usage_limit,
    trial_end_date: user.trial_end_date,
    chat_messages_count: user.chat_messages_count,
    chat_messages_limit: user.chat_messages_limit,
    documents_uploaded: user.documents_uploaded,
    documents_limit: user.documents_limit,
    api_calls_count: user.api_calls_count,
    api_calls_limit: user.api_calls_limit,
    storage_used_bytes: user.storage_used_bytes,
    storage_limit_bytes: user.storage_limit_bytes,
    features_enabled: user.features_enabled,
    permissions: user.permissions
  }
}

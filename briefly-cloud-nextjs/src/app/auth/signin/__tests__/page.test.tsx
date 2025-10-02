import { render, screen } from '@testing-library/react'
import SignInPage from '../page'

// Mock the auth constants
jest.mock('@/app/lib/auth/constants', () => ({
  OAUTH_ERROR_MESSAGES: {
    'invalid_request': 'Invalid request'
  },
  DEFAULT_POST_LOGIN_PATH: '/dashboard'
}))

describe('SignInPage Success Messages', () => {
  // Mock window.location.search and URLSearchParams
  const originalLocation = window.location
  const originalURLSearchParams = global.URLSearchParams

  beforeAll(() => {
    // Mock history.replaceState
    Object.defineProperty(window, 'history', {
      value: { replaceState: jest.fn() },
      writable: true
    })
  })

  afterAll(() => {
    // Restore original implementations
    global.URLSearchParams = originalURLSearchParams
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders signin page without errors', () => {
    // Mock URLSearchParams to return no parameters
    global.URLSearchParams = jest.fn().mockImplementation(() => ({
      get: jest.fn().mockReturnValue(null)
    }))

    render(<SignInPage />)

    expect(screen.getByText('Welcome to Briefly')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByText('Continue with Microsoft')).toBeInTheDocument()
  })

  it('contains success message components in the DOM structure', () => {
    // Mock URLSearchParams to simulate success message
    global.URLSearchParams = jest.fn().mockImplementation(() => ({
      get: jest.fn().mockImplementation((param: string) => {
        if (param === 'message') return 'signout_success'
        return null
      })
    }))

    render(<SignInPage />)

    expect(screen.getByText('Successfully Signed Out')).toBeInTheDocument()
    expect(screen.getByText('You have been securely signed out of your account.')).toBeInTheDocument()
  })

  it('contains error message components in the DOM structure', () => {
    // Mock URLSearchParams to simulate error message
    global.URLSearchParams = jest.fn().mockImplementation(() => ({
      get: jest.fn().mockImplementation((param: string) => {
        if (param === 'message') return 'signout_error'
        if (param === 'feedbackError') return 'Custom error message'
        return null
      })
    }))

    render(<SignInPage />)

    expect(screen.getByText('Signout Error')).toBeInTheDocument()
    expect(screen.getByText('Custom error message')).toBeInTheDocument()
  })

  it('shows default error message when no custom error is provided', () => {
    // Mock URLSearchParams to simulate error without custom message
    global.URLSearchParams = jest.fn().mockImplementation(() => ({
      get: jest.fn().mockImplementation((param: string) => {
        if (param === 'message') return 'signout_error'
        return null
      })
    }))

    render(<SignInPage />)

    expect(screen.getByText('Signout Error')).toBeInTheDocument()
    expect(screen.getByText('There was an issue signing you out. You have been logged out locally for security.')).toBeInTheDocument()
  })
})
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { CompleteUserData } from '@/app/lib/user-data-types';

// Mock the useSignout hook
const mockSignOut = jest.fn();
const mockClearError = jest.fn();

jest.mock('@/app/lib/auth/use-signout', () => ({
  useSignout: () => ({
    signOut: mockSignOut,
    isSigningOut: false,
    error: null,
    clearError: mockClearError,
    retry: jest.fn(),
    lastResult: null
  })
}));

// Mock user data
const mockUser: CompleteUserData = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  full_name: 'Test User',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  tier: 'free',
  api_calls_used: 0,
  api_calls_limit: 100,
  files_used: 0,
  files_limit: 10,
  storage_used: 0,
  storage_limit: 1000000,
  subscription_status: 'active',
  subscription_id: null,
  stripe_customer_id: null,
  last_login: '2023-01-01T00:00:00Z',
  preferences: {},
  features: []
};

describe('Sidebar Component', () => {
  const mockSetActiveTab = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with user data', () => {
    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    expect(screen.getByText('Briefly')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('shows signout button in user menu', async () => {
    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    // Click on user menu to open it
    const userMenuButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userMenuButton);

    // Check if signout button is visible
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('calls signOut when signout button is clicked', async () => {
    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    // Open user menu
    const userMenuButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userMenuButton);

    // Click signout button
    const signoutButton = screen.getByText('Sign Out');
    fireEvent.click(signoutButton);

    // Verify signOut was called with correct options
    expect(mockSignOut).toHaveBeenCalledWith({
      showLoading: true,
      forceRedirect: true
    });
  });

  it('shows loading state during signout', async () => {
    // Mock loading state
    const mockUseSignout = require('@/app/lib/auth/use-signout').useSignout as jest.Mock;
    mockUseSignout.mockReturnValue({
      signOut: mockSignOut,
      isSigningOut: true, // Loading state
      error: null,
      clearError: mockClearError,
      retry: jest.fn(),
      lastResult: null
    });

    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    // Open user menu
    const userMenuButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userMenuButton);

    // Should show loading state in signout button
    expect(screen.getByText('Signing out...')).toBeInTheDocument();
  });

  it('shows error state and retry option', async () => {
    const mockRetry = jest.fn();
    
    // Mock error state
    const mockUseSignout = require('@/app/lib/auth/use-signout').useSignout as jest.Mock;
    mockUseSignout.mockReturnValue({
      signOut: mockSignOut,
      isSigningOut: false,
      error: 'Network connection failed',
      clearError: mockClearError,
      retry: mockRetry,
      lastResult: null
    });

    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    // Open user menu
    const userMenuButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userMenuButton);

    // Should show error message
    expect(screen.getByText('Network connection failed')).toBeInTheDocument();
    
    // Should show retry button
    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeInTheDocument();
    
    // Click retry
    fireEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalled();
  });

  it('clears error when user dismisses it', async () => {
    // Mock error state
    const mockUseSignout = require('@/app/lib/auth/use-signout').useSignout as jest.Mock;
    mockUseSignout.mockReturnValue({
      signOut: mockSignOut,
      isSigningOut: false,
      error: 'Signout failed',
      clearError: mockClearError,
      retry: jest.fn(),
      lastResult: null
    });

    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={mockUser}
      />
    );

    // Open user menu
    const userMenuButton = screen.getByRole('button', { name: /test user/i });
    fireEvent.click(userMenuButton);

    // Should show error and dismiss button
    expect(screen.getByText('Signout failed')).toBeInTheDocument();
    
    const dismissButton = screen.getByLabelText('Dismiss error');
    fireEvent.click(dismissButton);
    
    expect(mockClearError).toHaveBeenCalled();
  });

  it('renders fallback UI when user data is not available', () => {
    render(
      <Sidebar
        activeTab="chat"
        setActiveTab={mockSetActiveTab}
        user={null}
      />
    );

    expect(screen.getByText('User data unavailable')).toBeInTheDocument();
    expect(screen.getByText('Briefly')).toBeInTheDocument();
  });
});
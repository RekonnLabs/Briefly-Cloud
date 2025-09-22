import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sidebar } from '../Sidebar';
import { SubscriptionStatus } from '../SubscriptionStatus';
import { CompleteUserData } from '@/app/lib/user-data-types';

// Mock the toast hook
jest.mock('../ui/toast', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
  }),
}));

// Mock window.location
delete (window as any).location;
(window as any).location = { href: '' };

describe('User Data Components', () => {
  const mockCompleteUserData: CompleteUserData = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    full_name: 'Test Full Name',
    image: 'https://example.com/avatar.jpg',
    subscription_tier: 'free',
    subscription_status: 'active',
    usage_count: 5,
    usage_limit: 10,
    trial_end_date: undefined,
    chat_messages_count: 3,
    chat_messages_limit: 10,
    documents_uploaded: 2,
    documents_limit: 10,
    api_calls_count: 15,
    api_calls_limit: 100,
    storage_used_bytes: 1024 * 1024, // 1MB
    storage_limit_bytes: 100 * 1024 * 1024, // 100MB
    usage_stats: {},
    preferences: {},
    features_enabled: {},
    permissions: {},
    usage_reset_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockProUserData: CompleteUserData = {
    ...mockCompleteUserData,
    subscription_tier: 'pro',
    usage_count: 50,
    usage_limit: 1000,
  };

  const mockTrialUserData: CompleteUserData = {
    ...mockCompleteUserData,
    subscription_tier: 'pro',
    subscription_status: 'trialing',
    trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  };

  const mockPastDueUserData: CompleteUserData = {
    ...mockCompleteUserData,
    subscription_tier: 'pro',
    subscription_status: 'past_due',
  };

  describe('Sidebar Component', () => {
    const mockSetActiveTab = jest.fn();

    beforeEach(() => {
      mockSetActiveTab.mockClear();
      (window as any).location.href = '';
    });

    it('renders correctly with complete user data', () => {
      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={mockCompleteUserData}
        />
      );

      expect(screen.getByText('Briefly')).toBeInTheDocument();
      expect(screen.getByText('AI Document Assistant')).toBeInTheDocument();
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('handles null user data gracefully', () => {
      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={null}
        />
      );

      expect(screen.getByText('Briefly')).toBeInTheDocument();
      expect(screen.getByText('User data unavailable')).toBeInTheDocument();
    });

    it('displays user name with fallback to full_name and email', () => {
      const userWithoutName = {
        ...mockCompleteUserData,
        name: undefined,
      };

      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={userWithoutName}
        />
      );

      expect(screen.getByText('Test Full Name')).toBeInTheDocument();
    });

    it('displays email fallback when no name is available', () => {
      const userWithoutNames = {
        ...mockCompleteUserData,
        name: undefined,
        full_name: undefined,
      };

      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={userWithoutNames}
        />
      );

      expect(screen.getAllByText('test@example.com')).toHaveLength(2); // Name and email fields
    });

    it('displays sign out button in user menu', () => {
      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={mockCompleteUserData}
        />
      );

      // Click on user menu to open it
      const userButton = screen.getByRole('button', { name: /test user/i });
      fireEvent.click(userButton);

      // Verify sign out button is displayed
      const signOutButton = screen.getByText('Sign Out');
      expect(signOutButton).toBeInTheDocument();
    });

    it('switches tabs correctly', () => {
      render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={mockCompleteUserData}
        />
      );

      const filesTab = screen.getByText('Files');
      fireEvent.click(filesTab);

      expect(mockSetActiveTab).toHaveBeenCalledWith('files');
    });
  });

  describe('SubscriptionStatus Component', () => {
    it('renders correctly with free tier user data', () => {
      render(<SubscriptionStatus user={mockCompleteUserData} />);

      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.getByText('5/10')).toBeInTheDocument(); // Usage indicator
      expect(screen.getByText('Upgrade')).toBeInTheDocument();
    });

    it('renders correctly with pro tier user data', () => {
      render(<SubscriptionStatus user={mockProUserData} />);

      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
      expect(screen.queryByText(/\/10/)).not.toBeInTheDocument(); // No usage indicator for pro
    });

    it('handles null user data gracefully', () => {
      render(<SubscriptionStatus user={null} />);

      expect(screen.getByText('User data unavailable')).toBeInTheDocument();
    });

    it('displays trial status correctly', () => {
      render(<SubscriptionStatus user={mockTrialUserData} />);

      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('(Trial)')).toBeInTheDocument();
    });

    it('displays past due status correctly', () => {
      render(<SubscriptionStatus user={mockPastDueUserData} />);

      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('Payment Due')).toBeInTheDocument();
    });

    it('shows usage warning when near limit', () => {
      const nearLimitUser = {
        ...mockCompleteUserData,
        usage_count: 9, // 90% of limit
        usage_limit: 10,
      };

      render(<SubscriptionStatus user={nearLimitUser} />);

      const usageIndicator = screen.getByText('9/10');
      expect(usageIndicator).toHaveClass('bg-yellow-900/50', 'text-yellow-300');
    });

    it('shows usage error when over limit', () => {
      const overLimitUser = {
        ...mockCompleteUserData,
        usage_count: 12, // Over limit
        usage_limit: 10,
      };

      render(<SubscriptionStatus user={overLimitUser} />);

      const usageIndicator = screen.getByText('12/10');
      expect(usageIndicator).toHaveClass('bg-red-900/50', 'text-red-300');
    });

    it('opens upgrade modal when upgrade button is clicked', async () => {
      render(<SubscriptionStatus user={mockCompleteUserData} />);

      const upgradeButton = screen.getByText('Upgrade');
      fireEvent.click(upgradeButton);

      await waitFor(() => {
        expect(screen.getByText('Upgrade Your Plan')).toBeInTheDocument();
        expect(screen.getByText('Pro Plan')).toBeInTheDocument();
        expect(screen.getByText('Pro BYOK')).toBeInTheDocument();
      });
    });

    it('closes upgrade modal when close button is clicked', async () => {
      render(<SubscriptionStatus user={mockCompleteUserData} />);

      // Open modal
      const upgradeButton = screen.getByText('Upgrade');
      fireEvent.click(upgradeButton);

      await waitFor(() => {
        expect(screen.getByText('Upgrade Your Plan')).toBeInTheDocument();
      });

      // Close modal
      const closeButton = screen.getByText('✕');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Upgrade Your Plan')).not.toBeInTheDocument();
      });
    });
  });

  describe('Component Integration', () => {
    it('both components handle the same user data consistently', () => {
      const mockSetActiveTab = jest.fn();

      const { container: sidebarContainer } = render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={mockCompleteUserData}
        />
      );

      const { container: statusContainer } = render(
        <SubscriptionStatus user={mockCompleteUserData} />
      );

      // Both should display user information without errors
      expect(sidebarContainer).toBeInTheDocument();
      expect(statusContainer).toBeInTheDocument();
    });

    it('both components handle null user data consistently', () => {
      const mockSetActiveTab = jest.fn();

      const { container: sidebarContainer } = render(
        <Sidebar
          activeTab="chat"
          setActiveTab={mockSetActiveTab}
          user={null}
        />
      );

      const { container: statusContainer } = render(
        <SubscriptionStatus user={null} />
      );

      // Both should handle null gracefully
      expect(sidebarContainer).toBeInTheDocument();
      expect(statusContainer).toBeInTheDocument();
      expect(screen.getAllByText(/unavailable/i)).toHaveLength(2);
    });
  });
});

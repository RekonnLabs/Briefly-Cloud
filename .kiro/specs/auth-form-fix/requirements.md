# Requirements Document

## Introduction

The authentication form in Briefly Cloud has a navigation issue where the "Sign in" link from the signup page incorrectly redirects users to the create account page instead of the login page. This creates a confusing user experience where users cannot easily switch between login and signup modes as expected.

## Requirements

### Requirement 1

**User Story:** As a user who is on the signup page, I want to click "Already have an account? Sign in" and be taken to the login form, so that I can access my existing account.

#### Acceptance Criteria

1. WHEN a user is on the signup page (isLogin = false) AND clicks "Already have an account? Sign in" THEN the system SHALL display the login form (isLogin = true)
2. WHEN a user is on the login page (isLogin = true) AND clicks "Don't have an account? Sign up" THEN the system SHALL display the signup form (isLogin = false)
3. WHEN the form mode changes THEN the system SHALL clear any existing error or success messages
4. WHEN the form mode changes THEN the system SHALL preserve the current email and password field values

### Requirement 2

**User Story:** As a user navigating between login and signup forms, I want the form labels and button text to accurately reflect the current mode, so that I understand what action I'm about to perform.

#### Acceptance Criteria

1. WHEN the form is in login mode THEN the system SHALL display "Sign in to your account" as the subtitle
2. WHEN the form is in signup mode THEN the system SHALL display "Create your account" as the subtitle  
3. WHEN the form is in login mode THEN the submit button SHALL display "Sign In"
4. WHEN the form is in signup mode THEN the submit button SHALL display "Sign Up"
5. WHEN the form is in login mode THEN the toggle link SHALL display "Don't have an account? Sign up"
6. WHEN the form is in signup mode THEN the toggle link SHALL display "Already have an account? Sign in"

### Requirement 3

**User Story:** As a user who successfully creates an account, I want to be automatically switched to the login form with a success message, so that I can immediately sign in with my new credentials.

#### Acceptance Criteria

1. WHEN a user successfully completes signup THEN the system SHALL switch to login mode (isLogin = true)
2. WHEN a user successfully completes signup THEN the system SHALL display a success message about email confirmation
3. WHEN the form switches to login mode after signup THEN the system SHALL preserve the email address that was used for signup
4. WHEN the form switches to login mode after signup THEN the system SHALL clear the password field for security
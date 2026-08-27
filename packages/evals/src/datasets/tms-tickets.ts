/**
 * Golden Dataset of TMS Test Cases for Prompt & Agent Evaluations
 */

export interface GoldenTmsTicket {
  id: string;
  source: 'azure-devops' | 'jira-xray' | 'testrail';
  title: string;
  description: string;
  steps: { action: string; expectedResult: string }[];
  preconditions: string[];
  testData: Record<string, string>;
  expectedQualityScore: number;
  expectedStatus: 'APPROVED' | 'REJECTED';
}

export const GOLDEN_TMS_TICKETS: GoldenTmsTicket[] = [
  {
    id: 'TC-101-VALID',
    source: 'azure-devops',
    title: 'User Login with 2FA Authenticator Code',
    description:
      'Verify registered user can successfully authenticate using email, password, and TOTP token.',
    preconditions: ['User account exists in test environment with 2FA enabled'],
    testData: {
      email: 'test.user+${UUID}@example.com',
      password: 'SecretPassword123!',
      otpSecret: 'JBSWY3DPEHPK3PXP',
    },
    steps: [
      {
        action: 'Navigate to login page /login',
        expectedResult: 'Login form is visible with Email, Password inputs and Sign In button',
      },
      {
        action: 'Fill email and password, click Sign In',
        expectedResult: 'Redirected to 2FA verification step, 6-digit OTP input is visible',
      },
      {
        action: 'Enter valid 6-digit TOTP code and submit',
        expectedResult: 'Redirected to /dashboard, user profile widget displays user email',
      },
    ],
    expectedQualityScore: 95,
    expectedStatus: 'APPROVED',
  },
  {
    id: 'TC-102-INVALID-MONOLITH',
    source: 'jira-xray',
    title: 'E2E Full Platform Regression Testing',
    description:
      'Test all features from login to profile settings, cart, payment, logout, and password reset.',
    preconditions: [],
    testData: {},
    steps: [
      { action: 'Step 1: Open app', expectedResult: 'App opens' },
      { action: 'Step 2: Log in', expectedResult: 'Logged in' },
      { action: 'Step 3: Edit profile', expectedResult: 'Profile edited' },
      { action: 'Step 4: Change avatar', expectedResult: 'Avatar changed' },
      { action: 'Step 5: Browse catalog', expectedResult: 'Catalog loaded' },
      { action: 'Step 6: Add 5 items to cart', expectedResult: 'Cart count updated' },
      { action: 'Step 7: Apply promo code', expectedResult: 'Discount applied' },
      { action: 'Step 8: Proceed to checkout', expectedResult: 'Checkout page opens' },
      { action: 'Step 9: Fill shipping address', expectedResult: 'Address saved' },
      { action: 'Step 10: Choose payment method', expectedResult: 'Payment options show' },
      { action: 'Step 11: Enter credit card details', expectedResult: 'Card accepted' },
      { action: 'Step 12: Click Place Order', expectedResult: 'Order confirmation shown' },
      { action: 'Step 13: Check email for invoice', expectedResult: 'Email received' },
      { action: 'Step 14: Log out', expectedResult: 'Logged out' },
      { action: 'Step 15: Request password reset', expectedResult: 'Reset link sent' },
      { action: 'Step 16: Click reset link', expectedResult: 'Reset form opens' },
      { action: 'Step 17: Enter new password', expectedResult: 'Password changed' },
      { action: 'Step 18: Re-login with new password', expectedResult: 'Success' },
    ],
    expectedQualityScore: 35,
    expectedStatus: 'REJECTED',
  },
];

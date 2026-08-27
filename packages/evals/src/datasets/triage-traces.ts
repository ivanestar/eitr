/**
 * Golden Dataset of Test Failure Traces for Trace-Debugger Evals
 */

export interface GoldenTriageTrace {
  id: string;
  scenario: string;
  errorTrace: string;
  consoleLogs: string[];
  networkLogs: { url: string; status: number; method: string }[];
  expectedCategory: '[PRODUCT BUG]' | '[SELECTOR DRIFT]' | '[FLAKY / TIMING]';
  expectedAction: 'REVERT_AND_REPORT_BUG' | 'UPDATE_PAGE_OBJECT' | 'AUTO_RETRY_ASSERTION';
}

export const GOLDEN_TRIAGE_TRACES: GoldenTriageTrace[] = [
  {
    id: 'TRACE-01-SERVER-ERROR',
    scenario: 'Submit user feedback form',
    errorTrace: `Error: Timed out 10000ms waiting for expect(locator).toBeVisible()\nLocator: getByText('Thank you for your feedback!')\nExpected: visible\nReceived: <element(s) not found>`,
    consoleLogs: [
      '[ERROR] Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
      'Uncaught (in promise) Error: Request failed with status code 500: Database lock timeout',
    ],
    networkLogs: [{ url: 'https://api.example.com/v1/feedback', status: 500, method: 'POST' }],
    expectedCategory: '[PRODUCT BUG]',
    expectedAction: 'REVERT_AND_REPORT_BUG',
  },
  {
    id: 'TRACE-02-SELECTOR-DRIFT',
    scenario: 'Click checkout payment button after frontend UI redesign',
    errorTrace: `Error: locator.click: Target closed\nCall log:\n  - waiting for locator('button.btn-checkout-legacy')`,
    consoleLogs: [],
    networkLogs: [],
    expectedCategory: '[SELECTOR DRIFT]',
    expectedAction: 'UPDATE_PAGE_OBJECT',
  },
  {
    id: 'TRACE-03-TIMING-JITTER',
    scenario: 'Verify notification banner appearance',
    errorTrace: `AssertionError: expect(received).toBe(true)\nExpected: true\nReceived: false\n    at NotificationWidget.isVisibleNow (components/widgets/notification.ts:15:20)`,
    consoleLogs: [],
    networkLogs: [
      { url: 'https://api.example.com/v1/user/notifications', status: 200, method: 'GET' },
    ],
    expectedCategory: '[FLAKY / TIMING]',
    expectedAction: 'AUTO_RETRY_ASSERTION',
  },
];

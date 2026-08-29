// Template for generating shared/utils/api-client.ts. create-if-absent.

export function renderApiClient(): string {
  return `import type { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export interface ApiClientOptions {
  baseURL?: string;
  graphqlPath?: string;
}

/**
 * Universal, typed HTTP client wrapper around Playwright's APIRequestContext.
 * Handles standard REST actions (GET, POST, etc.) and GraphQL queries.
 *
 * For application-specific protocols like gRPC:
 * Since gRPC requires proto schema files and compilation, you should extend this client,
 * import your generated proto typescript bindings, and use a library like 'protobufjs'
 * or standard gRPC-web clients.
 */
export class ApiClient {
  private readonly request: APIRequestContext;
  private readonly options: ApiClientOptions;
  private readonly teardownTasks: Array<() => Promise<void> | void> = [];

  constructor(request: APIRequestContext, options: ApiClientOptions = {}) {
    this.request = request;
    this.options = options;
  }

  /**
   * Register a teardown/cleanup function to be executed automatically after the test.
   * Tasks are executed in LIFO (Last-In-First-Out) order.
   */
  registerTeardown(cleanupFn: () => Promise<void> | void): void {
    this.teardownTasks.push(cleanupFn);
  }

  /**
   * Execute all registered teardown tasks in reverse order (LIFO).
   * Safe against individual task failures to guarantee complete cleanup.
   */
  async cleanup(): Promise<void> {
    while (this.teardownTasks.length > 0) {
      const task = this.teardownTasks.pop();
      if (task) {
        try {
          await task();
        } catch {
          // Ignore individual errors so subsequent teardown tasks always run
        }
      }
    }
  }

  /**
   * Generate a collision-free dynamic test identifier for isolated TDM.
   */
  createUniqueId(prefix: string = 'id'): string {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Generate a unique isolated test email address for test user creation.
   */
  createTestEmail(prefix: string = 'user'): string {
    return (
      'test-' +
      prefix +
      '-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2, 6) +
      '@example.com'
    );
  }

  /**
   * Generate a valid formatted test phone number (e.g. +18005551234).
   */
  createTestPhone(countryCode: string = '+1'): string {
    const area = Math.floor(200 + Math.random() * 800);
    const prefix = Math.floor(200 + Math.random() * 800);
    const line = Math.floor(1000 + Math.random() * 9000);
    return countryCode + String(area) + String(prefix) + String(line);
  }

  /**
   * Generate a compliant, complex test password (upper, lower, digit, special).
   */
  createTestPassword(length: number = 12): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*()_+-=';
    const all = upper + lower + digits + special;
    let pwd =
      upper[Math.floor(Math.random() * upper.length)] +
      lower[Math.floor(Math.random() * lower.length)] +
      digits[Math.floor(Math.random() * digits.length)] +
      special[Math.floor(Math.random() * special.length)];
    for (let i = 4; i < Math.max(8, length); i++) {
      pwd += all[Math.floor(Math.random() * all.length)];
    }
    return pwd;
  }

  /**
   * Generate an RFC4122 v4 compliant test UUID without external dependencies.
   */
  createTestUuid(): string {
    return randomUUID();
  }

  /**
   * Generate a readable test entity or user name.
   */
  createTestName(prefix: string = 'User'): string {
    return prefix + '_' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Generate a random currency amount or numeric value within bounds.
   */
  createTestAmount(min: number = 10, max: number = 1000, decimals: number = 2): number {
    const val = min + Math.random() * (max - min);
    return Number(val.toFixed(decimals));
  }

  /**
   * Generate an ISO 8601 YYYY-MM-DD date string with optional day offset.
   */
  createTestDate(offsetDays: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }

  private get defaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Perform a GET request.
   */
  async get<T>(
    url: string,
    headers?: Record<string, string>,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const response = await this.request.get(url, {
      headers: { ...this.defaultHeaders, ...headers },
      ...(params ? { params } : {}),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Perform a POST request.
   */
  async post<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.request.post(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Perform a PUT request.
   */
  async put<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.request.put(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Perform a PATCH request.
   */
  async patch<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.request.patch(url, {
      data,
      headers: { ...this.defaultHeaders, ...headers },
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Perform a DELETE request.
   */
  async delete<T>(
    url: string,
    headers?: Record<string, string>,
    params?: Record<string, string | number | boolean>,
  ): Promise<T> {
    const response = await this.request.delete(url, {
      headers: { ...this.defaultHeaders, ...headers },
      ...(params ? { params } : {}),
    });
    return this.handleResponse<T>(response);
  }

  /**
   * Perform a GraphQL query or mutation.
   * Maps to a POST request to the graphqlPath (defaults to '/graphql').
   */
  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    const path = this.options.graphqlPath || '/graphql';
    return this.post<T>(path, { query, variables }, headers);
  }

  private async handleResponse<T>(response: APIResponse): Promise<T> {
    if (!response.ok()) {
      const text = await response.text();
      throw new Error('API request failed with status ' + response.status() + ': ' + text);
    }
    const text = await response.text();
    if (!text) {
      return {} as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Fallback if the response is raw text instead of JSON
      return text as unknown as T;
    }
  }
}
`;
}

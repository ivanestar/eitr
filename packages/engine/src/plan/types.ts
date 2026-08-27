import type { StackProfile } from '../types/stack-profile.js';
import type { FileDescriptor } from '../types/generation-plan.js';

export interface PlanOptions {
  // baseURL baked into the emitted playwright.config.ts; recon will supply it later.
  baseUrl?: string;
  // package.json "name" for the generated project.
  projectName?: string;
  // Selected language (defaults to typescript).
  language?: string;
  // Selected E2E automation tool (defaults to playwright).
  automationTool?: string;
  // CI/CD tool choice
  ciCd?: string;
  // Selected AI Assistants
  aiAssistants?: string[];
  // Selected Test Management System (TMS) for MCP integration
  tmsProvider?: string;
  // Default storageState file path baked into emitted playwright.config.ts (Stage 2).
  storageStatePath?: string;
  // When true, emit co-located *.sanity.spec.ts files next to Page Object blueprints (Stage 2).
  generateSanitySpecs?: boolean;
  // When false, suppress Dockerfile and .dockerignore emission.
  docker?: boolean;
}

export const DEFAULT_BASE_URL = 'http://localhost:4173';
export const DEFAULT_PROJECT_NAME = 'playwright-tests';

/**
 * Interface representing a modular generator for a specific language & automation tool combination.
 */
export interface TargetGenerator {
  readonly language: string;
  readonly automationTool: string;
  plan(profile: StackProfile, opts: PlanOptions): FileDescriptor[];
}

/**
 * Language-specific adapter: emits files that are language-specific (runtime assets,
 * compiler config, formatting, framework-specific helpers).
 *
 * Implement this interface for each new programming language.
 */
export interface LanguageAdapter {
  /** Identifies this adapter, must match PlanOptions.language. */
  readonly id: string;
  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[];
}

/**
 * Tool-specific adapter: emits files that are automation-tool-specific (runner config,
 * entry-point test fixtures, example specs, environment defaults).
 *
 * Implement this interface for each new E2E test automation tool.
 */
export interface ToolAdapter {
  /** Identifies this adapter, must match PlanOptions.automationTool. */
  readonly id: string;
  planFiles(profile: StackProfile, opts: PlanOptions): FileDescriptor[];
}

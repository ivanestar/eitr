export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface EvalRunResult {
  passed: boolean;
  provider: 'gemini' | 'anthropic' | 'openai' | 'mock';
  model: string;
  systemRule: string;
  userPrompt: string;
  responseRaw: string;
  responseCode: string;
  apiCalled: boolean;
  usage: TokenUsage;
}

/**
 * Rates per 1,000,000 tokens (USD)
 */
export const MODEL_PRICING_TABLE: Record<string, { input: number; output: number }> = {
  // Anthropic Claude (Claude 5 generation)
  'claude-opus-5': { input: 5.0, output: 25.0 },
  'claude-sonnet-5': { input: 2.0, output: 10.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-3-7-sonnet-20250219': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  // Google Gemini (Gemini 3 / 2.5 generation)
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro': { input: 2.0, output: 12.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  // OpenAI (GPT-4o & o-Series reasoning)
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  o3: { input: 2.0, output: 8.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
};

export function calculateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const m = model.toLowerCase();
  let rate = { input: 2.0, output: 10.0 }; // default sonnet-5

  for (const [key, val] of Object.entries(MODEL_PRICING_TABLE)) {
    if (m.includes(key.toLowerCase())) {
      rate = val;
      break;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * rate.input;
  const outputCost = (outputTokens / 1_000_000) * rate.output;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Universal Multi-Provider Live LLM Runner for Prompt Evaluations with Token & Cost Tracking.
 */
export async function runEvalPrompt(
  prompt: string,
  systemInstruction: string,
  options?: { preferredProvider?: 'gemini' | 'anthropic' | 'openai'; model?: string },
): Promise<EvalRunResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const provider =
    options?.preferredProvider ??
    (geminiKey ? 'gemini' : anthropicKey ? 'anthropic' : openaiKey ? 'openai' : 'mock');

  if (provider === 'gemini' && geminiKey) {
    const model = process.env.GEMINI_MODEL ?? options?.model ?? 'gemini-2.0-flash';
    try {
      const { text, inputTokens, outputTokens } = await callGeminiApi(
        geminiKey,
        model,
        systemInstruction,
        prompt,
      );
      const totalTokens = inputTokens + outputTokens;
      const estimatedCostUsd = calculateCostUsd(model, inputTokens, outputTokens);

      return {
        passed: true,
        provider: 'gemini',
        model,
        systemRule: systemInstruction,
        userPrompt: prompt,
        responseRaw: text,
        responseCode: extractCodeBlock(text),
        apiCalled: true,
        usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd },
      };
    } catch (err: any) {
      console.warn(
        `[WARN] Gemini API call failed (${err.message}). Falling back to mock response.`,
      );
    }
  }

  if (provider === 'anthropic' && anthropicKey) {
    const model = process.env.ANTHROPIC_MODEL ?? options?.model ?? 'claude-sonnet-5';
    try {
      const { text, inputTokens, outputTokens } = await callAnthropicApi(
        anthropicKey,
        model,
        systemInstruction,
        prompt,
      );
      const totalTokens = inputTokens + outputTokens;
      const estimatedCostUsd = calculateCostUsd(model, inputTokens, outputTokens);

      return {
        passed: true,
        provider: 'anthropic',
        model,
        systemRule: systemInstruction,
        userPrompt: prompt,
        responseRaw: text,
        responseCode: extractCodeBlock(text),
        apiCalled: true,
        usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd },
      };
    } catch (err: any) {
      console.warn(
        `[WARN] Anthropic API call failed (${err.message}). Falling back to mock response.`,
      );
    }
  }

  if (provider === 'openai' && openaiKey) {
    const model = process.env.OPENAI_MODEL ?? options?.model ?? 'gpt-4o-mini';
    try {
      const { text, inputTokens, outputTokens } = await callOpenAiApi(
        openaiKey,
        model,
        systemInstruction,
        prompt,
      );
      const totalTokens = inputTokens + outputTokens;
      const estimatedCostUsd = calculateCostUsd(model, inputTokens, outputTokens);

      return {
        passed: true,
        provider: 'openai',
        model,
        systemRule: systemInstruction,
        userPrompt: prompt,
        responseRaw: text,
        responseCode: extractCodeBlock(text),
        apiCalled: true,
        usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd },
      };
    } catch (err: any) {
      console.warn(
        `[WARN] OpenAI API call failed (${err.message}). Falling back to mock response.`,
      );
    }
  }

  // Offline mock fallback
  const responseRaw = generateMockResponse(prompt);
  return {
    passed: true,
    provider: 'mock',
    model: 'mock-offline',
    systemRule: systemInstruction,
    userPrompt: prompt,
    responseRaw,
    responseCode: extractCodeBlock(responseRaw),
    apiCalled: false,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
  };
}

async function callGeminiApi(
  apiKey: string,
  model: string,
  systemInstruction: string,
  prompt: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API returned status ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as any;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;

  return { text, inputTokens, outputTokens };
}

async function callAnthropicApi(
  apiKey: string,
  model: string,
  systemInstruction: string,
  prompt: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url = 'https://api.anthropic.com/v1/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemInstruction,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API returned status ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as any;
  let text = '';
  if (Array.isArray(json.content)) {
    text = json.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n')
      .trim();
  }

  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

async function callOpenAiApi(
  apiKey: string,
  model: string,
  systemInstruction: string,
  prompt: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const url = 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API returned status ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as any;
  const text = json.choices?.[0]?.message?.content ?? '';
  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;

  return { text, inputTokens, outputTokens };
}

function generateMockResponse(prompt: string): string {
  if (prompt.includes('Automate') || prompt.includes('spec')) {
    return `\`\`\`typescript
import { test } from '@fixtures';
import { expect } from '@playwright/test';

test('TC-101: User Login with 2FA Authenticator Code', async ({ loginPage, dashboardPage }) => {
  await test.step('Step 1: Navigate to login page', async () => {
    await loginPage.open();
    await expect(loginPage.emailInput.locator).toBeVisible();
  });

  await test.step('Step 2: Fill credentials and submit', async () => {
    await loginPage.login('test.user@example.com', 'SecretPassword123!');
  });

  await test.step('Step 3: Enter TOTP code and submit', async () => {
    await expect(dashboardPage.profileCard.locator).toBeVisible();
  });
});
\`\`\``;
  }

  if (prompt.includes('Audit this ticket') || prompt.includes('tms-validator')) {
    return `
# TMS Quality Scorecard
- Overall Score: 35%
- Status: REJECTED
- Scenario Atomicity: FAIL (18 steps exceeds maximum limit of 10)
- Expected Results Verifiability: FAIL (Ambiguous generic assertions)
- Recommendation: Decompose monolithic scenario into 4 atomic tickets.
`;
  }

  if (prompt.includes('Triage this failure') || prompt.includes('500')) {
    return `
[PRODUCT BUG] Backend service returned HTTP 500 (Database lock timeout).
Action: File backend defect ticket. Do not alter Page Object locators.
`;
  }

  if (prompt.includes('violating')) {
    return `
import { Component, Button } from '@components';

export class CustomDropdown extends Component {
  async get trigger() {
    return this.child(Button, '.custom-combo-trigger');
  }

  selectOption(value: string): void {
    expect(value).not.toBeNull();
    this.page.locator('.custom-combo-item').click();
  }

  getValue(): Promise<string> {
    return this.page.locator('.custom-combo-value').innerText();
  }
}
`;
  }

  return `
import { Component, Button } from '@components';

export class CustomDropdown extends Component {
  get trigger() {
    return this.child(Button, '.custom-combo-trigger');
  }

  async selectOption(value: string): Promise<void> {
    await this.trigger.click();
    await this.page.locator(\`.custom-combo-item[data-value="\${value}"]\`).click();
  }

  async valueNow(): Promise<string> {
    return await this.page.locator('.custom-combo-value').innerText();
  }
}
`;
}

export function extractCodeBlock(text: string): string {
  const match =
    /```(?:typescript|ts|javascript|js)?\s*\n?([\s\S]*?)```/i.exec(text) ||
    /```([\s\S]*?)```/.exec(text);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

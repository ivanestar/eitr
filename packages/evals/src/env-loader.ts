import * as fs from 'fs';
import * as path from 'path';

/**
 * Model resolution mapping for generation-latest model aliases.
 */
export const MODEL_ALIASES: Record<
  string,
  { provider: 'anthropic' | 'gemini' | 'openai'; model: string; name: string }
> = {
  // Anthropic Claude latest generations
  sonnet: { provider: 'anthropic', model: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
  opus: { provider: 'anthropic', model: 'claude-opus-5', name: 'Claude Opus 5' },
  haiku: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },

  // Google Gemini latest generations
  flash: { provider: 'gemini', model: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
  pro: { provider: 'gemini', model: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },

  // OpenAI latest generations
  gpt4o: { provider: 'openai', model: 'gpt-4o', name: 'GPT-4o' },
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', name: 'GPT-4o' },
  mini: { provider: 'openai', model: 'gpt-4o-mini', name: 'GPT-4o mini' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini', name: 'GPT-4o mini' },
  o3: { provider: 'openai', model: 'o3-mini', name: 'o3-mini' },
  'o3-mini': { provider: 'openai', model: 'o3-mini', name: 'o3-mini' },
};

/**
 * Automatically loads .env file into process.env if present.
 */
export function loadEnvFile(): void {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      break;
    }
  }
}

/**
 * Parses CLI flags from process.argv (e.g. --sonnet, --flash, --gpt4o) and resolves to the latest model.
 */
export function resolveCliModelFlags(): {
  provider?: 'anthropic' | 'gemini' | 'openai';
  model?: string;
  modelName?: string;
} {
  loadEnvFile();

  const args = process.argv;
  for (const arg of args) {
    const cleanArg = arg.replace(/^--?/, '').toLowerCase();
    if (cleanArg in MODEL_ALIASES) {
      const target = MODEL_ALIASES[cleanArg];
      if (target.provider === 'anthropic') {
        process.env.ANTHROPIC_MODEL = target.model;
        process.env.PREFERRED_EVAL_PROVIDER = 'anthropic';
      } else if (target.provider === 'gemini') {
        process.env.GEMINI_MODEL = target.model;
        process.env.PREFERRED_EVAL_PROVIDER = 'gemini';
      } else if (target.provider === 'openai') {
        process.env.OPENAI_MODEL = target.model;
        process.env.PREFERRED_EVAL_PROVIDER = 'openai';
      }
      return {
        provider: target.provider,
        model: target.model,
        modelName: target.name,
      };
    }
  }

  return {};
}

// Auto-run resolution on import
resolveCliModelFlags();

import { detectAgent, env } from 'std-env';
import { SDK_VERSION } from './version.js';

/**
 * Name of the coding agent running the SDK, as reported by std-env.
 * Replit is only trusted when set explicitly via AI_AGENT: its REPL_ID marker
 * is also present in terminals humans use.
 */
export function detectCodingAgent(): string | undefined {
  const { name } = detectAgent();
  if (name === 'replit' && !env.AI_AGENT) {
    return undefined;
  }
  return name;
}

export function clientIdentityHeaders(): Record<string, string> {
  const agent = detectCodingAgent();
  return {
    'X-CloudCruise-Client': `sdk-js/${SDK_VERSION}`,
    ...(agent ? { 'X-CloudCruise-Agent': agent } : {})
  };
}

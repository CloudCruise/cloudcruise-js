import { detectAgent } from 'std-env';
import { SDK_VERSION } from './version.js';

export function clientIdentityHeaders(): Record<string, string> {
  const agent = detectAgent().name;
  return {
    'X-CloudCruise-Client': `sdk-js/${SDK_VERSION}`,
    ...(agent ? { 'X-CloudCruise-Agent': agent } : {})
  };
}

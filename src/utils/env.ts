export type CloudCruiseEnvVar =
  | 'CLOUDCRUISE_API_KEY'
  | 'CLOUDCRUISE_BASE_URL'
  | 'CLOUDCRUISE_ENCRYPTION_KEY';

export function getEnv(key: CloudCruiseEnvVar): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  } else if (typeof globalThis !== 'undefined' && (globalThis as any)[key]) {
    return (globalThis as any)[key];
  }
  return undefined;
}


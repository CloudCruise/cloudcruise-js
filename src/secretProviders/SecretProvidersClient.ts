import type {
  SecretProvider,
  SecretProviderItem
} from '../vault/types.js';

export class SecretProvidersClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>
  ) {
    this.makeRequest = makeRequest;
  }

  async list(): Promise<SecretProvider[]> {
    const response = await this.makeRequest<SecretProvider[]>('GET', '/secret-providers');
    return Array.isArray(response) ? response : [response];
  }

  async listItems(secretProviderId: string): Promise<SecretProviderItem[]> {
    if (!secretProviderId) {
      throw new Error('secretProviderId is required');
    }

    const response = await this.makeRequest<SecretProviderItem[]>(
      'GET',
      `/secret-providers/${secretProviderId}/items`
    );
    return Array.isArray(response) ? response : [response];
  }
}

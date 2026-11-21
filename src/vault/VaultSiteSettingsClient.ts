import type {
  ApplySiteSettingsDefaultsRequest,
  ClearSiteSettingsOverridesRequest,
  SiteSettings,
  SiteSettingsEntry,
  SiteSettingsEntryOverrides,
  UpdateSiteSettingsRequest
} from './types.js';

/**
 * Domain settings: defaults that every vault entry on a domain inherits unless
 * the entry sets its own value.
 */
export class VaultSiteSettingsClient {
  private readonly makeRequest: <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: any
  ) => Promise<T>;

  constructor(
    makeRequest: <T = any>(
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: any
    ) => Promise<T>
  ) {
    this.makeRequest = makeRequest;
  }

  /**
   * Lists the workspace's domain settings. Each item says how many entries use
   * the domain and, for each setting, how many of them override it.
   */
  async list(): Promise<SiteSettings[]> {
    return await this.makeRequest<SiteSettings[]>('GET', '/vault/site-settings');
  }

  /**
   * Sets the defaults for one domain, creating them when the domain has none
   * yet. Only the settings in the request change; `null` clears a default.
   * Entries that set their own value keep it.
   * @returns The updated domain settings
   */
  async update(request: UpdateSiteSettingsRequest): Promise<SiteSettings> {
    if (!request || !request.domain) {
      throw new Error('domain is required to update site settings');
    }
    return await this.makeRequest<SiteSettings>('PATCH', '/vault/site-settings', request);
  }

  /**
   * Lists the workspace's vault entries on a domain, each with the settings it
   * sets itself instead of inheriting the domain default.
   */
  async listEntries(domain: string): Promise<SiteSettingsEntry[]> {
    if (!domain) {
      throw new Error('domain is required to list the entries of a domain');
    }
    const params = new URLSearchParams({ domain });
    return await this.makeRequest<SiteSettingsEntry[]>(
      'GET',
      `/vault/site-settings/entries?${params.toString()}`
    );
  }

  /**
   * Removes every setting the listed entries set themselves, so they read all
   * settings from the domain defaults. Without `entry_ids` it applies to every
   * entry on the domain.
   * @returns The updated domain settings
   */
  async applyDefaults(request: ApplySiteSettingsDefaultsRequest): Promise<SiteSettings> {
    if (!request || !request.domain) {
      throw new Error('domain is required to apply site settings defaults');
    }
    return await this.makeRequest<SiteSettings>('PATCH', '/vault/site-settings/entries', request);
  }

  /**
   * Gets the settings an entry sets itself. Every other setting is read from
   * the domain settings.
   * @param permissioned_user_id - User identifier for the vault entry
   * @param domain - Domain of the entry. Optional while the user ID has a single entry.
   */
  async getOverrides(
    permissioned_user_id: string,
    domain?: string | null
  ): Promise<SiteSettingsEntryOverrides> {
    if (!permissioned_user_id) {
      throw new Error('permissioned_user_id is required to get site settings overrides');
    }
    const params = new URLSearchParams({ permissioned_user_id });
    if (domain) {
      params.append('domain', domain);
    }
    return await this.makeRequest<SiteSettingsEntryOverrides>(
      'GET',
      `/vault/site-settings/overrides?${params.toString()}`
    );
  }

  /**
   * Stops an entry from overriding the listed settings, so it reads them from
   * the domain settings again.
   * @returns The settings the entry still overrides
   */
  async clearOverrides(
    request: ClearSiteSettingsOverridesRequest
  ): Promise<SiteSettingsEntryOverrides> {
    if (!request || !request.permissioned_user_id) {
      throw new Error('permissioned_user_id is required to clear site settings overrides');
    }
    if (!request.keys || request.keys.length === 0) {
      throw new Error('keys must list at least one setting to clear');
    }
    const { domain, ...rest } = request;
    return await this.makeRequest<SiteSettingsEntryOverrides>(
      'PATCH',
      '/vault/site-settings/overrides',
      { ...rest, ...(domain ? { domain } : {}) }
    );
  }
}

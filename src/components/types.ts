/**
 * CloudCruise COMPONENT_CALL Type Definitions
 *
 * Source of truth (copy from, do not diverge): monorepo
 * packages/types/globalTypes/workflow/workflow-types.ts
 * (ComponentReference, ComponentCallParameters, ComponentImport,
 * ComponentDefinition, ComponentIOSchema). Hand-written to match this SDK's
 * existing type style. Implementation gated until the API contract locks.
 */

export type ComponentVersionRef = number | 'latest';

export interface ComponentReference {
  type: 'global' | 'local';
  ref: string;
  version?: ComponentVersionRef;
}

export interface ComponentCallParameters {
  component: ComponentReference;
  arguments: Record<string, string>;
  output_mappings?: Record<string, string>;
  allowed_components?: ComponentReference[];
}

export interface ComponentCallNode {
  id: string;
  name: string;
  action: 'COMPONENT_CALL';
  parameters: ComponentCallParameters;
  description?: string;
}

export interface ComponentImport {
  id: string;
  version: ComponentVersionRef;
  alias?: string;
}

export type ComponentIOSchema = Record<string, unknown>;

export interface ComponentVaultSchemaCredential {
  type: 'credential';
  domain: string;
  example?: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  input_schema?: ComponentIOSchema;
  output_schema?: ComponentIOSchema;
  nodes: unknown[];
  edges: Record<string, unknown>;
  vault_schema?: Record<string, ComponentVaultSchemaCredential>;
  popup_xpaths?: string[];
}

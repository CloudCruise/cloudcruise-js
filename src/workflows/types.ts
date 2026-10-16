/**
 * CloudCruise Workflows API Type Definitions
 */

export interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  created_by: string;
  enable_popup_handling: boolean;
  enable_xpath_recovery: boolean;
  enable_error_code_generation: boolean;
  enable_service_unavailable_recovery: boolean;
  enable_action_timing_recovery: boolean;
}


export type WorkflowPropertySchema =
  | boolean
  | string
  | string[]
  | {
      // Accept both a single string and string[] for compatibility
      type?: string | string[];
      // Allow additional JSON Schema keywords without strict typing
      [key: string]: unknown;
    };

export interface WorkflowInputSchema {
  type?: string | string[];
  properties?: Record<string, WorkflowPropertySchema>;
  required?: string[];
  additionalProperties?: WorkflowPropertySchema;
  // Preserve all Draft-07 keywords returned by the API.
  [key: string]: unknown;
}

export interface WorkflowVaultCredentialSchema {
  type: 'credential';
  domain: string;
  example?: string;
}

export type WorkflowVaultSchema = Record<
  string,
  WorkflowVaultCredentialSchema
>;

export interface WorkflowMetadata {
  input_schema: WorkflowInputSchema;
  workspace_id?: string;
  vault_schema?: WorkflowVaultSchema;
  /** UUID of the workflow version these schemas belong to. */
  version_id?: string;
  /** Semantic version of the workflow version these schemas belong to. */
  version?: string;
  /** Branch the described version was saved on. */
  branch_id?: string;
}

/**
 * Selects which workflow version to describe, like the pins on `StartRunRequest`.
 * Set at most one; without either, the default branch's latest version is used.
 */
export interface WorkflowVersionSelector {
  /** Highest release matching an exact version or semver range ("1.2.3", "^1.2.0", "1.x"). */
  workflow_version?: string | null;
  /** UUID of a workflow branch; its latest version is used. */
  workflow_branch_id?: string | null;
}

export interface WorkflowVersion {
  version_id: string;
  version: string;
  /** Branch the version was saved on. Absent on APIs without branch support. */
  branch_id?: string;
  version_note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WorkflowBranch {
  id: string;
  workflow_id: string;
  name: string;
  /** Whether unpinned runs use this branch. */
  is_default: boolean;
  head_version_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvalidTypeDetail {
  field: string;
  expected_display: string; // human-friendly joined string of expected types
  actual: string;
}

export interface SchemaErrorDetail {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
}

export class InputValidationError extends Error {
  public readonly missingRequired: string[];
  public readonly invalidTypes: InvalidTypeDetail[];
  public readonly unknownKeys: string[];
  public readonly schemaErrors: SchemaErrorDetail[];

  constructor(
    message: string = 'Input validation failed',
    missingRequired: string[] = [],
    invalidTypes: InvalidTypeDetail[] = [],
    unknownKeys: string[] = [],
    schemaErrors: SchemaErrorDetail[] = []
  ) {
    super(message);
    this.name = 'InputValidationError';
    this.missingRequired = missingRequired;
    this.invalidTypes = invalidTypes;
    this.unknownKeys = unknownKeys;
    this.schemaErrors = schemaErrors;
  }
}

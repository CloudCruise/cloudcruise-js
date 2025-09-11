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


export interface WorkflowInputSchema {
  type?: 'object';
  properties?: Record<string, string[]>;
  required?: string[];
}

export interface WorkflowMetadata {
  input_schema: WorkflowInputSchema;
}

export interface InvalidTypeDetail {
  field: string;
  expected: string[];
  actual: string;
}

export class InputValidationError extends Error {
  public readonly missingRequired: string[];
  public readonly invalidTypes: InvalidTypeDetail[];

  constructor(
    message: string = 'Input validation failed',
    missingRequired: string[] = [],
    invalidTypes: InvalidTypeDetail[] = []
  ) {
    super(message);
    this.name = 'InputValidationError';
    this.missingRequired = missingRequired;
    this.invalidTypes = invalidTypes;
  }
}
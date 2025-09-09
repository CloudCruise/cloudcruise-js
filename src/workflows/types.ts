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

export interface WorkflowErrorReportTimeframe {
  start: string;
  end: string;
}

export interface WorkflowError {
  session_id: string;
  created_at: string;
  error_description: string;
}

export interface WorkflowErrorGroup {
  count: number;
  errors: WorkflowError[];
}

export interface WorkflowErrorReport {
  workflow_id: string;
  timeframe: WorkflowErrorReportTimeframe;
  total_errors: number;
  error_groups: Record<string, WorkflowErrorGroup>;
}

export interface GetWorkflowErrorsFilters {
  workflow_id: string;
  start_timestamp: string;
  end_timestamp: string;
}

export interface WorkflowInputSchema {
  type: 'object';
  properties: Record<string, string[]>;
  required: string[];
}

export interface WorkflowMetadata {
  input_schema: WorkflowInputSchema;
}
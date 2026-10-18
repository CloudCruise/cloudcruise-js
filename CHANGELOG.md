# Changelog

## 1.5.0

### Added

- `StartRunRequest.workflow_version` pins a run to the highest tagged release matching an exact version or semver range, and `StartRunRequest.workflow_branch_id` runs the latest version on a workflow branch instead of the default branch. Setting both throws; unset or `null` pins are omitted from the `POST /run` body. Requires a backend with run version pinning.
- `workflows.getWorkflowMetadata()` and `workflows.validateWorkflowInput()` take an optional `WorkflowVersionSelector` (`{ workflow_version?, workflow_branch_id? }`), so schemas can be read and checked for the version a pinned run executes. `WorkflowMetadata` gains `version_id`, `version` and `branch_id`. A selector against an API without version selection throws instead of returning the default branch's schemas.
- `workflows.listWorkflowVersions()` returns `WorkflowVersion` entries (including their `branch_id`) and `workflows.listWorkflowBranches()` returns `WorkflowBranch` entries with `is_default`.

### Changed

- `runs.start()` no longer fetches workflow metadata to validate `run_input_variables` locally before `POST /run`. The server validates them against the version that actually runs and its errors are thrown as the same `InputValidationError`, so runs pinned to a version or branch with a different input schema are no longer rejected, and every run saves one request. `workflows.validateWorkflowInput()` is unchanged for callers who want to check a payload up front.

## 1.4.0

### Added

- Requests send `X-CloudCruise-Client: sdk-js/<version>`, plus `X-CloudCruise-Agent: <agent>` when a coding agent runs the SDK.
- Added `std-env` as a runtime dependency.

## 1.3.1

### Changed

- Workflow metadata types expose `workspace_id` and `vault_schema`, including required credential `type` and `domain` fields.

## 1.3.0

### Added

- Full JSON Schema Draft-07 validation for workflow inputs, including nested schemas, patterns, arrays, limits, combinators, enums, and local references.
- Structured `InputValidationError.schemaErrors` details for both local and backend validation failures.

### Changed

- Backend `run_input_variables_errors` are surfaced as `InputValidationError` instead of a generic `Error`.
- Workflow metadata supports direct and nested API response shapes.
- Added AJV as a runtime dependency.

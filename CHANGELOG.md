# Changelog

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

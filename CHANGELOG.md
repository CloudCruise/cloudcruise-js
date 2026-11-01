# Changelog

## Unreleased

### Added

- `EventType` covers every event the API sends: `agent.recovery`, `execution.password_recovery`, `execution.password_updated`, and `agent.tfa_setup_recovery`, with typed payloads for the first three. The `agent.recovery` payload is `AgentRecoveryPayload`: category, sub-type, outcome and resume node title, plus session and workflow ids.
- Decision Required events `agent.decision_requested` and `agent.decision_answered`, typed as `AgentDecisionRequestedPayload` and `AgentDecisionAnsweredPayload`. `agent.decision_requested` carries `decision_id`, `question`, `context`, `fields` (ids, labels, types, options), `free_text` and `respond_url` (POST the answer there); `agent.decision_answered` carries `outcome` (`answered`, `declined`, `expired`, `cancelled`, `failed`) and, when someone answered, `answered_via`, `answered_by` and `answer` (`values`, `text`, `directive`). Session and workflow ids come first, the run's metadata is in the envelope, and optional keys are omitted rather than null.

### Changed

- The API no longer sends `execution.input_required`: runs do not pause to wait for corrected input variables. A consequential popup is reported through `agent.decision_requested` / `agent.decision_answered` when Decision Required handles the run, and otherwise fails the run with `execution.failed`. The event type, its payload types and the input-variable handlers stay for compatibility and for the history of earlier runs.

## 1.4.1

### Fixed

- The paused run event is `execution.paused`, matching what the API sends. It was typed as `execution.pause`, so handlers comparing against the SDK value never matched.

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

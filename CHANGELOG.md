# Changelog

## Unreleased

### Added

- `EventType` covers every event the API sends: `agent.recovery`, `execution.password_recovery`, `execution.password_updated`, and `agent.tfa_setup_recovery`, with typed payloads for the first three. The `agent.recovery` payload is `AgentRecoveryPayload`: category, sub-type, outcome and resume node title, plus session and workflow ids.
- Decision Required events `agent.decision_requested` and `agent.decision_answered`, typed as `AgentDecisionRequestedPayload` and `AgentDecisionAnsweredPayload`. `agent.decision_requested` carries `decision_id`, `answer_by` (the decision deadline), `question`, `context`, `fields` (ids, labels, types, options), `free_text`, `respond_url` (POST the answer there) and, when available, `signed_screenshot_url` / `signed_screenshot_url_expires`; `agent.decision_answered` carries `outcome` (`answered`, `declined`, `expired`, `cancelled`, `failed`) and, when someone answered, `answered_via`, `answered_by` and `answer` (`values`, `text`, `directive`). Session and workflow ids come first, the run's metadata is in the envelope, and optional keys are omitted rather than null.

### Removed (breaking)

- `execution.input_required` is gone from the API, so it is gone here too: `EventType.ExecutionInputRequired`, `ExecutionInputRequiredPayload`, `InputRequiredReason`, `PopupContext`, `AvailableAction`, `PopupRetry`, and the `runs` helpers `submitModalAction`, `submitInputVariables`, `onPopupDecisionRequired` and `onInputVariablesRequired` (the `/run/{session_id}/new_input_variables` endpoint they called no longer exists). Consequential popups are reported through `agent.decision_requested` / `agent.decision_answered` and answered at the event's `respond_url`.

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

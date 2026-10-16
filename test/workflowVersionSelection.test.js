import test from 'node:test';
import assert from 'node:assert/strict';

import { InputValidationError, WorkflowsClient } from '../dist/index.js';

const LATEST_METADATA = {
  input_schema: {
    type: 'object',
    properties: { added_in_latest: { type: 'string' } },
    required: ['added_in_latest'],
  },
  workspace_id: 'ws-1',
  vault_schema: {},
  version_id: 'version-latest',
  version: '2.0.0',
  branch_id: 'branch-main',
};

const PINNED_METADATA = {
  input_schema: {
    type: 'object',
    properties: { field_of_1_x: { type: 'string' } },
    required: ['field_of_1_x'],
  },
  workspace_id: 'ws-1',
  vault_schema: {},
  version_id: 'version-1-2-3',
  version: '1.2.3',
  branch_id: 'branch-main',
};

function recordingClient(responses) {
  const requests = [];
  const client = new WorkflowsClient(async (method, path) => {
    requests.push(`${method} ${path}`);
    if (!(path in responses)) throw new Error(`unexpected request ${path}`);
    return responses[path];
  });
  return { client, requests };
}

// Existing callers must keep hitting exactly the URL they always did, so their
// behaviour and any request mocking they rely on stay the same.
test('getWorkflowMetadata without a selector requests the unchanged path', async () => {
  const { client, requests } = recordingClient({ '/workflows/wf-1/metadata': LATEST_METADATA });
  const metadata = await client.getWorkflowMetadata('wf-1');
  assert.deepEqual(requests, ['GET /workflows/wf-1/metadata']);
  assert.equal(metadata.version, '2.0.0');
});

// The SDK names the selector workflow_version, as on runs.start(); the API takes it
// as the version query parameter, URL-encoded since ranges contain ^ and spaces.
test('getWorkflowMetadata sends workflow_version as the encoded version query', async () => {
  const { client } = recordingClient({ '/workflows/wf-1/metadata?version=%5E1.2.0': PINNED_METADATA });
  const metadata = await client.getWorkflowMetadata('wf-1', { workflow_version: '^1.2.0' });
  assert.equal(metadata.version_id, 'version-1-2-3');
  assert.equal(metadata.version, '1.2.3');
});

// workflow_branch_id maps to the API's branch_id query parameter, the same name
// GET /workflows/{id} uses for branch reads.
test('getWorkflowMetadata sends workflow_branch_id as the branch_id query', async () => {
  const { client, requests } = recordingClient({
    '/workflows/wf-1/metadata?branch_id=branch-feature': PINNED_METADATA,
  });
  await client.getWorkflowMetadata('wf-1', { workflow_branch_id: 'branch-feature' });
  assert.deepEqual(requests, ['GET /workflows/wf-1/metadata?branch_id=branch-feature']);
});

// A null selector counts as unset, as with the pins on StartRunRequest.
test('getWorkflowMetadata treats null selectors as unset', async () => {
  const { client, requests } = recordingClient({ '/workflows/wf-1/metadata': LATEST_METADATA });
  await client.getWorkflowMetadata('wf-1', { workflow_version: null, workflow_branch_id: null });
  assert.deepEqual(requests, ['GET /workflows/wf-1/metadata']);
});

// A version and a branch can point at different versions, and the API rejects the
// combination; failing locally names the problem and skips the request.
test('getWorkflowMetadata throws without a request when both selectors are set', async () => {
  const { client, requests } = recordingClient({});
  await assert.rejects(
    client.getWorkflowMetadata('wf-1', { workflow_version: '1.2.3', workflow_branch_id: 'branch-feature' }),
    /Only one of workflow_version, workflow_branch_id may be provided/,
  );
  assert.deepEqual(requests, []);
});

// An API without version selection ignores the unknown query parameter and describes
// the default branch instead. Its response has no version_id, and returning it would
// silently hand back the wrong version's schema.
test('getWorkflowMetadata with a selector rejects a response from an API that ignores it', async () => {
  const { version_id, version, branch_id, ...oldApiResponse } = LATEST_METADATA;
  const { client } = recordingClient({ '/workflows/wf-1/metadata?version=1.2.3': oldApiResponse });
  await assert.rejects(
    client.getWorkflowMetadata('wf-1', { workflow_version: '1.2.3' }),
    /does not support selecting a workflow version/,
  );
});

// A payload built for an older release must pass against that release's schema even
// though the latest version requires a different field.
test('validateWorkflowInput with a selector validates against that version', async () => {
  const { client } = recordingClient({
    '/workflows/wf-1/metadata': LATEST_METADATA,
    '/workflows/wf-1/metadata?version=1.2.3': PINNED_METADATA,
  });
  await client.validateWorkflowInput('wf-1', { field_of_1_x: 'x' }, { workflow_version: '1.2.3' });
  await assert.rejects(
    client.validateWorkflowInput('wf-1', { field_of_1_x: 'x' }),
    (error) => error instanceof InputValidationError,
  );
});

// Each version names its branch so callers can pick a release on a given branch and
// pass its version as workflow_version.
test('listWorkflowVersions returns the versions endpoint response', async () => {
  const versions = [
    {
      version_id: 'v-2',
      version: '2.0.0',
      branch_id: 'branch-main',
      version_note: 'Adds a field',
      created_by: 'user-1',
      created_at: '2026-10-16T00:00:00Z',
    },
  ];
  const { client, requests } = recordingClient({ '/workflows/wf-1/versions': versions });
  assert.deepEqual(await client.listWorkflowVersions('wf-1'), versions);
  assert.deepEqual(requests, ['GET /workflows/wf-1/versions']);
});

// is_default tells callers which branch unpinned runs use.
test('listWorkflowBranches returns branches with is_default', async () => {
  const branches = [
    { id: 'branch-main', name: 'main', is_default: true },
    { id: 'branch-feature', name: 'feature', is_default: false },
  ];
  const { client, requests } = recordingClient({ '/workflows/wf-1/branches': branches });
  const result = await client.listWorkflowBranches('wf-1');
  assert.deepEqual(result.map((b) => [b.name, b.is_default]), [['main', true], ['feature', false]]);
  assert.deepEqual(requests, ['GET /workflows/wf-1/branches']);
});

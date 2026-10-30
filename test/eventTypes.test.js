import test from 'node:test';
import assert from 'node:assert/strict';

import { EventType } from '../dist/index.js';

test('EventType values equal the event strings the API sends, including recovery and Decision Required events', () => {
  assert.deepEqual(Object.values(EventType).sort(), [
    'agent.decision_answered',
    'agent.decision_requested',
    'agent.error_analysis',
    'agent.recovery',
    'agent.tfa_setup_recovery',
    'execution.failed',
    'execution.input_required',
    'execution.password_recovery',
    'execution.password_updated',
    'execution.paused',
    'execution.queued',
    'execution.requeued',
    'execution.start',
    'execution.step',
    'execution.stopped',
    'execution.success',
    'file.uploaded',
    'interaction.failed',
    'interaction.finished',
    'interaction.waiting',
    'screenshot.uploaded',
    'video.uploaded',
  ]);
});

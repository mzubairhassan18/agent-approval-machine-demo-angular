/**
 * Headless proof that the store works with no DOM, no framework and no Angular.
 *
 *   node scripts/store-check.mjs
 *
 * It exercises the four things this demo exists to show: an approve batch with a
 * partial failure, a retry that touches only the failed item, the undo window
 * (recall + expiry), and an edit landing in the payload the executor receives.
 * `node:assert` is the runner; there is no test framework dependency.
 */
import assert from 'node:assert/strict';
import { createApprovalStore } from 'agent-approval-machine';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const line = (label) => console.log(`  ${label}`);

/* ------------------------------------------------------------------ setup */

const items = [
  { id: 'a', title: 'Refund — duplicate charge', amount: 249 },
  { id: 'b', title: 'Payout — contractor invoice', amount: 4120.5 },
  { id: 'c', title: 'Refund — goodwill credit', amount: 49 },
];

const batches = []; // every batch the executor was handed, by id
let runs = 0;

const store = createApprovalStore({
  items,
  canUndo: true,
  undoMs: 200, // short so the window can be observed in a test
  canEdit: true,
  canSelect: true,
  onExecute: async (batch) => {
    runs += 1;
    batches.push(batch.map((item) => item.id));

    const succeeded = [];
    const failed = [];
    for (const item of batch) {
      // Only the very first run rejects "b", so the retry can succeed.
      if (item.id === 'b' && runs === 1) {
        failed.push({ item, error: 'provider rejected the payout (422)' });
      } else {
        succeeded.push(item);
      }
    }
    return { succeeded, failed };
  },
});

const byId = () => Object.fromEntries(store.getSnapshot().itemsWithState.map((r) => [r.item.id, r]));

/* ------------------------------------------------- 1. partial failure */

const first = await store.approve();

assert.equal(first.succeeded.length, 2, 'two items should succeed');
assert.equal(first.failed.length, 1, 'one item should fail');
assert.equal(first.failed[0].item.id, 'b', 'the failed item should be "b"');
assert.deepEqual(batches[0], ['a', 'b', 'c'], 'the first batch should be all three items');

const afterFirst = byId();
assert.equal(afterFirst.a.status, 'undoing');
assert.equal(afterFirst.b.status, 'failed');
assert.equal(afterFirst.c.status, 'undoing');
assert.equal(afterFirst.b.error, 'provider rejected the payout (422)');

const snap = store.getSnapshot();
assert.equal(snap.summary.success, 0);
assert.equal(snap.summary.failed, 1);
assert.equal(snap.summary.undoing, 2);
assert.equal(typeof snap.canUndoUntil, 'number', 'an undo window should be open');

line(`approve() -> ${first.succeeded.length} succeeded / ${first.failed.length} failed`);
line(`statuses: a=${afterFirst.a.status} b=${afterFirst.b.status} c=${afterFirst.c.status}`);

/* ------------------------------------------------- 2. recall inside window */

store.undo('c');
assert.equal(byId().c.status, 'needs_approval', 'a recall should reopen the item');

/* ------------------------------------------------- 3. retry only what failed */

const second = await store.retryFailed();

assert.deepEqual(batches[1], ['b'], 'retryFailed() must touch only the failed item');
assert.equal(second.succeeded.length, 1, 'the retry should succeed');
assert.equal(second.failed.length, 0);
assert.equal(second.succeeded[0].id, 'b');

line(`retryFailed() -> batch [${batches[1].join(', ')}] -> ${second.succeeded.length} succeeded`);

/* ------------------------------------------------- 4. undo window transition */

assert.equal(byId().a.status, 'undoing', 'still inside the window');

await sleep(320); // undoMs is 200, so the window has closed

const afterExpiry = byId();
assert.equal(afterExpiry.a.status, 'success', 'expiry should settle the item');
assert.equal(afterExpiry.b.status, 'success', 'the retried item settles too');
assert.equal(afterExpiry.c.status, 'needs_approval', 'the recalled item stays open');
assert.equal(store.getSnapshot().canUndoUntil, null, 'no window should be open');

line(`after ${200}ms window: a=${afterExpiry.a.status} b=${afterExpiry.b.status} c=${afterExpiry.c.status}`);

/* ------------------------------------------------- 5. edits reach the executor */

const editBatches = [];
const editing = createApprovalStore({
  items: [{ id: 'x', body: 'draft' }],
  canUndo: false,
  onExecute: async (batch) => {
    editBatches.push(batch);
    return { succeeded: batch, failed: [] };
  },
});

editing.edit('x', { body: 'human rewrite' });
assert.equal(editing.getSnapshot().itemsWithState[0].status, 'editing');
assert.equal(editing.getSnapshot().itemsWithState[0].edited, true);

await editing.approve();
assert.equal(editBatches[0][0].body, 'human rewrite', 'onExecute receives the edited payload');
line('edit() -> onExecute received the rewritten body');

/* ------------------------------------------------- 6. snapshot stability */

const stable = store.getSnapshot();
assert.equal(store.getSnapshot(), stable, 'getSnapshot() is referentially stable');
line('getSnapshot() returned the same object twice with no change');

/* ----------------------------------------------------------------- done */

store.destroy();
editing.destroy();

console.log('\nstore-check: all assertions passed\n');

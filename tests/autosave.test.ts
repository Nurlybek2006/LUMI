import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveQueue } from '../src/services/autosave.ts';

test('autosave queue serializes writes and keeps the latest rapid edit', async () => {
  const writes: number[] = [];
  const queue = new SaveQueue<number>(async (value) => { await new Promise((resolve) => setTimeout(resolve, 12)); writes.push(value); });
  const first = queue.enqueue(1);
  void queue.enqueue(2);
  void queue.enqueue(3);
  await first;
  await queue.enqueue(4);
  await queue.flush();
  assert.deepEqual(writes, [1, 3, 4]);
});

test('autosave retains the newest pending value after a failed write and retries on flush', async () => {
  const writes: number[] = [];
  let failFirst = true;
  const queue = new SaveQueue<number>(async (value) => {
    writes.push(value);
    if (value === 1 && failFirst) { failFirst = false; throw new Error('disk busy'); }
  });

  await assert.rejects(queue.enqueue(1), /disk busy/u);
  await queue.enqueue(2);
  await queue.flush();
  assert.deepEqual(writes, [1, 2]);
});

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

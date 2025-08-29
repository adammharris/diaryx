import { describe, it, expect } from 'vitest';
import { ConcurrencyManager } from '../utils/concurrency.manager';

describe('ConcurrencyManager', () => {
  it('serializes operations per key', async () => {
    const cm = new ConcurrencyManager();
    const order: number[] = [];
    const p1 = cm.acquireCloudLock('a', async () => { await new Promise(r=>setTimeout(r,20)); order.push(1); return 1; });
    const p2 = cm.acquireCloudLock('a', async () => { order.push(2); return 2; });
    const res = await Promise.all([p1,p2]);
    expect(res).toEqual([1,2]);
    expect(order).toEqual([1,2]);
  });

  it('reports active operations', async () => {
    const cm = new ConcurrencyManager();
    const p = cm.acquireCloudLock('b', async () => { await new Promise(r=>setTimeout(r,10)); });
    expect(cm.getSyncStatus().activeOperations).toHaveLength(1);
    await p;
    expect(cm.getSyncStatus().activeOperations).toHaveLength(0);
  });
});

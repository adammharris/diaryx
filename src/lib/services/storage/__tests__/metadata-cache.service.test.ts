import { describe, it, expect } from 'vitest';
import { MetadataCacheService } from '../metadata-cache.service';

function createMockDB(){
  const stores: Record<string, Map<any, any>> = { entries: new Map(), metadata: new Map(), cloudMappings: new Map() };
  return {
    getAllFromIndex: async ()=> Array.from(stores.metadata.values()),
    transaction(name:any){ return { store:{ index:()=>({ getAll: async ()=> Array.from(stores.metadata.values()) }) }, objectStore:(n:string)=>({ put: async (v:any)=>{ stores[n].set(v.id||v.localId,v); }, delete: async(id:any)=>{ stores[n].delete(id); } }), done: Promise.resolve() } as any; },
  } as any;
}

describe('MetadataCacheService', () => {
  it('caches metadata entries', async () => {
    const db = createMockDB();
    const svc = new MetadataCacheService(async ()=>db);
    await svc.cacheMetadata([{ id:'a', title:'A', created_at:'1', modified_at:'1', file_path:'a', preview:'' } as any]);
    const all = await svc.getCachedMetadata();
    expect(all[0].id).toBe('a');
  });
});

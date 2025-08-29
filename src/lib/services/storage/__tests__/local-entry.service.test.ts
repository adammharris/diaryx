import { describe, it, expect, beforeEach } from 'vitest';
import { LocalEntryService } from '../local-entry.service';
import { metadataStore } from '../../../stores/metadata';

const makeEntry = (id:string, title:string, content='')=>({ id, title, content, created_at:'2025', modified_at:'2025', file_path:`${id}.md` });

describe('LocalEntryService (web)', () => {
  let cached = new Map<string, any>();
  let service: LocalEntryService;

  beforeEach(()=>{
    cached.clear();
    metadataStore.clear();
    service = new LocalEntryService({
      environment: ()=> 'web',
      storageProvider: ()=>({ createEntry: async (t:string)=>t.toLowerCase() }) as any,
      entryCache: {
        cacheEntry: async (e:any)=>{ cached.set(e.id,e); },
        getCachedEntry: async (id:string)=> cached.get(id) || null,
        deleteCachedEntry: async (id:string)=>{ cached.delete(id); }
      },
      cacheSingleMetadata: async ()=>{}
    });
    cached.set('old-id', makeEntry('old-id','Old Title','content'));
  });

  it('renames entry and updates cache', async () => {
    const newId = await service.renameEntry('old-id','New Title');
    expect(newId).toBe('new-title');
    expect(cached.has('new-title')).toBe(true);
    expect(cached.has('old-id')).toBe(false);
  });
});

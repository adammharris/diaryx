import { writable } from 'svelte/store';
import type { JournalEntryMetadata } from '../storage/index.js';

interface MetadataState {
  entries: { [entryId: string]: JournalEntryMetadata };
  lastUpdated: number;
}

const initialState: MetadataState = {
  entries: {},
  lastUpdated: Date.now()
};

function createMetadataStore() {
  const { subscribe, set, update } = writable<MetadataState>(initialState);

  return {
    subscribe,
    
    // Set all entries metadata (from initial load)
    setAllEntries: (entries: JournalEntryMetadata[]) => {
      const entriesMap = entries.reduce((acc, entry) => {
        acc[entry.id] = entry;
        return acc;
      }, {} as { [entryId: string]: JournalEntryMetadata });
      
      set({
        entries: entriesMap,
        lastUpdated: Date.now()
      });
    },
    
    // Update metadata for a specific entry
    updateEntryMetadata: (entryId: string, metadata: JournalEntryMetadata) => {
      update(state => ({
        ...state,
        entries: {
          ...state.entries,
          [entryId]: metadata
        },
        lastUpdated: Date.now()
      }));
    },
    
    // Remove entry metadata
    removeEntryMetadata: (entryId: string) => {
      update(state => {
        const newEntries = { ...state.entries };
        delete newEntries[entryId];
        return {
          ...state,
          entries: newEntries,
          lastUpdated: Date.now()
        };
      });
    },
    
    // Get metadata for a specific entry
    getEntryMetadata: (entryId: string): Promise<JournalEntryMetadata | null> => {
      return new Promise((resolve) => {
        update(state => {
          resolve(state.entries[entryId] || null);
          return state;
        });
      });
    },
    
    // Get all entries as array
    getAllEntries: (): Promise<JournalEntryMetadata[]> => {
      return new Promise((resolve) => {
        update(state => {
          resolve(Object.values(state.entries));
          return state;
        });
      });
    },
    
    // Clear all metadata
    clear: () => {
      set({
        entries: {},
        lastUpdated: Date.now()
      });
    }
  };
}

export const metadataStore = createMetadataStore();
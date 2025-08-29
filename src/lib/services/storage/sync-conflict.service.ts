import { fetch } from '../../utils/fetch';
import { apiAuthService } from '../../services/api-auth.service';

export class SyncConflictService {
  constructor(private getCloudId: (entryId: string)=> Promise<string | null>, private removeCloudMapping: (entryId: string)=> Promise<void>) {}

  async check(entryId: string, localModified: string): Promise<{ hasConflict: boolean; cloudEntry?: any }> {
    try {
      const cloudId = await this.getCloudId(entryId);
      if (!cloudId) return { hasConflict: false };
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const resp = await fetch(`${apiUrl}/entries/${cloudId}`, { method: 'GET', headers: { ...apiAuthService.getAuthHeaders() } });
      if (!resp.ok) {
        if (resp.status === 404) { await this.removeCloudMapping(entryId); return { hasConflict: false }; }
        return { hasConflict: false };
      }
      const result = await resp.json();
      const cloudEntry = result.data;
      const cloudTime = new Date(cloudEntry.updated_at).getTime();
      const localTime = new Date(localModified).getTime();
      if (cloudTime > localTime) return { hasConflict: true, cloudEntry };
      return { hasConflict: false };
    } catch {
      return { hasConflict: false };
    }
  }
}

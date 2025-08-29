// SharedEntryService: facade for entry sharing operations used across storage/cloud modules
import { entrySharingService } from './entry-sharing.service';

export class SharedEntryService {
  shareEntry = entrySharingService.shareEntry.bind(entrySharingService);
  revokeAllEntryAccess = entrySharingService.revokeAllEntryAccess.bind(entrySharingService);
  getEntryAccessUsers = entrySharingService.getEntryAccessUsers.bind(entrySharingService);
  revokeEntryAccessForUsers = entrySharingService.revokeEntryAccessForUsers.bind(entrySharingService);
  getEntryAccessKey = entrySharingService.getEntryAccessKey.bind(entrySharingService);
  grantAccessToExistingEntry = entrySharingService.grantAccessToExistingEntry.bind(entrySharingService);
}

export const sharedEntryService = new SharedEntryService();

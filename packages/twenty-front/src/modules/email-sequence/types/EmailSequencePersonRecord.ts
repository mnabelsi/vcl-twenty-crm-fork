import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

export type EmailSequencePersonRecord = ObjectRecord & {
  name?: { firstName?: string | null; lastName?: string | null } | null;
  jobTitle?: string | null;
  emails?: { primaryEmail?: string | null } | null;
  company?: (ObjectRecord & { name?: string | null }) | null;
};

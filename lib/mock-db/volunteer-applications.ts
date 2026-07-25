import { readData, updateData } from './index';
import { generateId, now } from '@/lib/utils';
import type { VolunteerApplication } from '@/types';

export const DECEMBER_VOLUNTEER_CAMPAIGN_ID = 'december-mega-meetup' as const;

const VOLUNTEER_APPLICATIONS_FILE = 'volunteer-applications';

type CreateVolunteerApplicationInput = Omit<VolunteerApplication, 'id' | 'campaign_id' | 'created_at'>;

export async function createVolunteerApplication(input: CreateVolunteerApplicationInput): Promise<{
  application: VolunteerApplication;
  created: boolean;
}> {
  return updateData<VolunteerApplication, { application: VolunteerApplication; created: boolean }>(
    VOLUNTEER_APPLICATIONS_FILE,
    async (applications) => {
      const existing = applications.find((application) => (
        application.campaign_id === DECEMBER_VOLUNTEER_CAMPAIGN_ID
        && application.email.toLowerCase() === input.email.toLowerCase()
      ));

      if (existing) {
        return {
          data: applications,
          result: { application: existing, created: false },
        };
      }

      const application: VolunteerApplication = {
        id: generateId(),
        campaign_id: DECEMBER_VOLUNTEER_CAMPAIGN_ID,
        ...input,
        created_at: now(),
      };

      return {
        data: [...applications, application],
        result: { application, created: true },
      };
    },
  );
}

export async function getVolunteerApplications(): Promise<VolunteerApplication[]> {
  const applications = await readData<VolunteerApplication>(VOLUNTEER_APPLICATIONS_FILE);
  return applications
    .filter((application) => application.campaign_id === DECEMBER_VOLUNTEER_CAMPAIGN_ID)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

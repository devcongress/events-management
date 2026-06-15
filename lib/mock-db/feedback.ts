import { readData, writeData } from './index';
import { generateId, now } from '@/lib/utils';
import type { EventFeedbackSubmission, FeedbackCampaign, FeedbackQuestion } from '@/types';

const CAMPAIGNS_FILE = 'feedback-campaigns';
const SUBMISSIONS_FILE = 'event-feedback-submissions';

function defaultQuestions(): FeedbackQuestion[] {
  return [
    {
      id: generateId(),
      type: 'rating',
      label: 'How would you rate today\'s event?',
      required: true,
      options: [],
      order_index: 0,
    },
    {
      id: generateId(),
      type: 'talk_select',
      label: 'Which talk or session was most useful?',
      required: false,
      options: [],
      order_index: 1,
    },
    {
      id: generateId(),
      type: 'text',
      label: 'What should we improve for the next meetup?',
      required: true,
      options: [],
      order_index: 2,
    },
    {
      id: generateId(),
      type: 'yes_no',
      label: 'Would you attend the next DevCongress community event?',
      required: false,
      options: [],
      order_index: 3,
    },
  ];
}

export function createDefaultFeedbackCampaign(eventId: string): FeedbackCampaign {
  const createdAt = now();

  return {
    id: generateId(),
    event_id: eventId,
    title: 'How was the meetup?',
    intro: 'Tell us what landed, what dragged, and what should change next month.',
    status: 'draft',
    auto_open_on_event_completion: true,
    opens_at: null,
    closes_at: null,
    questions: defaultQuestions(),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export async function getAllFeedbackCampaigns(): Promise<FeedbackCampaign[]> {
  return readData<FeedbackCampaign>(CAMPAIGNS_FILE);
}

export async function getFeedbackCampaignByEvent(eventId: string): Promise<FeedbackCampaign | undefined> {
  const campaigns = await getAllFeedbackCampaigns();
  return campaigns.find((campaign) => campaign.event_id === eventId);
}

export async function getOrCreateFeedbackCampaign(eventId: string): Promise<FeedbackCampaign> {
  const campaigns = await getAllFeedbackCampaigns();
  const existing = campaigns.find((campaign) => campaign.event_id === eventId);

  if (existing) {
    return existing;
  }

  const campaign = createDefaultFeedbackCampaign(eventId);
  campaigns.push(campaign);
  await writeData(CAMPAIGNS_FILE, campaigns);
  return campaign;
}

export async function updateFeedbackCampaign(
  eventId: string,
  updates: Partial<Omit<FeedbackCampaign, 'id' | 'event_id' | 'created_at'>>,
): Promise<FeedbackCampaign> {
  const campaigns = await getAllFeedbackCampaigns();
  let index = campaigns.findIndex((campaign) => campaign.event_id === eventId);

  if (index === -1) {
    campaigns.push(createDefaultFeedbackCampaign(eventId));
    index = campaigns.length - 1;
  }

  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<Omit<FeedbackCampaign, 'id' | 'event_id' | 'created_at'>>;

  campaigns[index] = {
    ...campaigns[index],
    ...definedUpdates,
    questions: definedUpdates.questions ?? campaigns[index].questions,
    updated_at: now(),
  };

  await writeData(CAMPAIGNS_FILE, campaigns);
  return campaigns[index];
}

export async function createEventFeedbackSubmission(
  data: Omit<EventFeedbackSubmission, 'id' | 'created_at'>,
): Promise<EventFeedbackSubmission> {
  const submissions = await readData<EventFeedbackSubmission>(SUBMISSIONS_FILE);
  const submission: EventFeedbackSubmission = {
    ...data,
    id: generateId(),
    created_at: now(),
  };

  submissions.push(submission);
  await writeData(SUBMISSIONS_FILE, submissions);
  return submission;
}

export async function getFeedbackSubmissionsByEvent(eventId: string): Promise<EventFeedbackSubmission[]> {
  const submissions = await readData<EventFeedbackSubmission>(SUBMISSIONS_FILE);
  return submissions
    .filter((submission) => submission.event_id === eventId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getAllFeedbackSubmissions(): Promise<EventFeedbackSubmission[]> {
  return readData<EventFeedbackSubmission>(SUBMISSIONS_FILE);
}

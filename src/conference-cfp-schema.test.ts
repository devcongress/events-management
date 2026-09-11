import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
  ANNUAL_CONFERENCE_BIO_WORD_LIMIT,
  ANNUAL_CONFERENCE_SESSION_TYPES,
  ANNUAL_CONFERENCE_TOPIC_TRACKS,
} from '@/lib/annual-conference-cfp';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8');

describe('Annual Conference CFP contract', () => {
  it('uses the confirmed tracks, session types, and word limits', () => {
    expect(ANNUAL_CONFERENCE_TOPIC_TRACKS).toEqual([
      'Open Source & Developer Community',
      'AI & Emerging Technologies',
      'Tech Education',
      'Real-World Impact',
      'Cybersecurity',
      'UX & Product Design',
    ]);
    expect(ANNUAL_CONFERENCE_SESSION_TYPES).toEqual([
      '15-minute short talk',
      '25-minute short talk',
      '40-minute long talk',
      '60-minute workshop',
    ]);
    expect(ANNUAL_CONFERENCE_BIO_WORD_LIMIT).toBe(150);
    expect(ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT).toBe(250);
  });

  it('keeps the conference proposal schema separate from monthly CFP persistence', () => {
    const migration = read('supabase/migrations/20260907120000_annual_conference_complete_proposals.sql');
    const conferenceRoutes = read('server/routes/annual-conference-speakers.ts');
    const conferenceSchemas = read('server/routes/annual-conference-speakers/schemas.ts');

    expect(migration).toContain('annual_conference_speaker_submissions');
    expect(migration).toContain('drop column if exists kind');
    expect(migration).toContain('drop column if exists github_username');
    expect(migration).toContain('drop column if exists resource_url');
    expect(migration).toContain('drop column if exists claim_id');
    expect(migration).toContain('drop column if exists used_at');
    expect(migration).toContain('proposal_schema_version');
    expect(migration).toContain('revoked_at');
    expect(migration).toContain('accept_annual_conference_speaker_proposal');
    expect(migration).toContain('rotate_annual_conference_speaker_workspace');
    expect(migration).toContain('for update');
    expect(conferenceRoutes).toContain('createAnnualConferenceSpeakerSubmission');
    expect(conferenceSchemas).toContain('conferenceSpeakerSubmissionDecisionSchema');
    expect(conferenceRoutes).not.toContain('createSpeakerSubmission(');
    expect(conferenceSchemas).not.toContain('product_demo');
  });

  it('renders progressive outcomes and the editable logistics fields', () => {
    const cfp = read('src/components/ui/LearningOutcomesEditor.vue');
    const workspace = read('src/views/SpeakerTalkIntakeView.vue');

    expect(cfp).toContain('Add another outcome');
    expect(cfp).toContain('Add 3–5 concrete things attendees will understand, be able to do, or take away after your session.');
    expect(workspace).toContain('Availability confirmation');
    expect(workspace).toContain('Technical and setup requirements');
    expect(workspace).toContain('Workshop prerequisites');
    expect(workspace).toContain('SAVE DETAILS');
  });

  it('provides an open-form link for an open conference call', () => {
    const view = read('src/views/admin/AdminAnnualConferenceSpeakersView.vue');
    const link = view.match(/<a\s[^>]*:href="speakersQuery\.data\.value\.call\.public_path"[^>]*>[\s\S]*?<\/a>/)?.[0];

    expect(link).toBeDefined();
    expect(link).toContain('v-if="speakersQuery.data.value.call.open"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain('Open form');
    expect(link).toContain('opens in a new tab');
    expect(link).not.toContain('@click');
  });

  it('confirms receipt on-page and offers another proposal without promising an email', () => {
    const view = read('src/views/CfpView.vue');

    expect(view).toContain('Proposal received.');
    expect(view).toContain('Submit another proposal');
    expect(view).toContain("form.learning_outcomes = ['']");
    expect(view).not.toContain('We emailed you a receipt');
  });
});

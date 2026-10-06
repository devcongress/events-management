# Historical 2024 Product Brief: Community Presentations & Quiz Platform

> **Superseded historical reference only:** This pre-Vue 2024 product brief describes an earlier Next.js architecture and the retired classic Quiz, global Leaderboard, and account claim/merge product. It is not current implementation or product guidance. Its routes, schema, realtime plan, MVP checklist, and deleted hooks (including `use-countdown.ts`) must not be restored or treated as active scope. The active product scope, including the retained System Design learning rooms, is documented in `docs/`.

## Historical 2024 objective (superseded)

Build a web platform for a monthly community event where speakers present topics and attendees participate in competitive quizzes. The platform manages the entire presentation lifecycle (submission → reminders → event day → public archive) and includes a Kahoot-style quiz system with persistent leaderboards.

**Stack:** Next.js 14 (App Router) + Supabase (Auth, Database, Storage, Realtime)

---

## Core Concepts

### Users & Access

| Role | Access |
|------|--------|
| **Admin** | Manage events, speakers, talks, quizzes, view all dashboards |
| **Speaker** | Submit CFP, upload slides for their talks |
| **Attendee** | View public archive, play quizzes, see leaderboards |

Authentication:
- **Admins:** Supabase email/password auth
- **Speakers:** Magic link via email (low friction)
- **Attendees/Players:** Anonymous auth (device-based via localStorage), can optionally "claim" a username

### Identity & Claiming System

Players start anonymous with a device ID. To persist across devices or protect their username:

1. Player chooses "Claim this username"
2. Sets a permanent username + secret question/answer
3. System checks for other unclaimed scores with the same nickname
4. Player can merge selected device scores into their claimed account
5. Merged device records are kept for audit (`merged_into_user_id`)

---

## Features

### 1. Event Management (Admin)

- Create/edit events (name, date, description, status)
- Event statuses: `draft` → `cfp_open` → `cfp_closed` → `upcoming` → `live` → `completed`
- Dashboard showing all events and their state

### 2. Call for Presentations (CFP)

**Public CFP Form (when event CFP is open):**
- Speaker name, email, talk title, abstract, bio
- Creates a `Talk` in `submitted` status

**Admin Review:**
- View all submissions for an event
- Accept/reject talks
- Accepted speakers get notified via email

### 3. Slides Management

**Speaker Side:**
- Dashboard showing their accepted talks
- Upload interface: paste Google Drive link
- System copies file from Drive to Supabase Storage

**Admin Side:**
- See which speakers have/haven't uploaded
- Manual reminder trigger (in addition to automated)
- Download any slides for event-day projection

**Automated Reminders (Cron/Edge Function):**
- Runs daily
- Checks: talks where `status = accepted` AND `slides_uploaded = false` AND event is within 7 days
- Sends reminder emails at: 7 days, 3 days, 1 day before event

### 4. Public Presentation Archive

- Browse past events
- View talks with speaker info and slides (embedded viewer or download)
- Filter/search by event, speaker, topic
- Only shows talks where `status = published`

### 5. Quiz System (Kahoot-style)

**Admin - Quiz Setup:**
- Create quiz for an event
- Add questions: text, 4 options, correct answer, time limit (e.g., 20 seconds), point value
- Reorder questions

**Admin - Live Quiz Control:**
- Start session → generates join code
- Screen shows QR code + join URL
- "Next Question" button advances the quiz
- Live view of how many have answered
- Show correct answer + leaderboard after each question
- End quiz → final leaderboard

**Player - Quiz Experience:**
- Join via code/QR (no login needed)
- Enter nickname
- Wait screen until question appears
- Tap answer before timer expires
- See if correct + points earned
- Real-time leaderboard updates

**Scoring:**
- Base points for correct answer (e.g., 1000)
- Speed bonus: faster answers get more points
- Formula: `base_points * (time_remaining / time_limit)`

### 6. Leaderboards

**Public Leaderboards:**
- All-time top players
- Current month ranking
- Per-event results

**Player Profile (if claimed):**
- Their stats: total points, events participated, best finish
- History of quiz results

**Display:**
- Top 10 prominently featured
- Full leaderboard scrollable
- Badges/indicators: "🔥 3-event streak", "👑 Reigning champ", etc.

---

## Data Model

```sql
-- ENUMS
CREATE TYPE event_status AS ENUM ('draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed');
CREATE TYPE talk_status AS ENUM ('submitted', 'accepted', 'rejected', 'slides_received', 'published');
CREATE TYPE quiz_status AS ENUM ('draft', 'waiting', 'active', 'finished');

-- TABLES

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  status event_status DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Talks/Presentations
CREATE TABLE talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  speaker_name TEXT NOT NULL,
  speaker_email TEXT NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  bio TEXT,
  status talk_status DEFAULT 'submitted',
  drive_link TEXT,
  storage_path TEXT,
  slides_uploaded_at TIMESTAMPTZ,
  reminder_sent_count INT DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (Players & Admins)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE,
  nickname TEXT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  secret_question TEXT,
  secret_answer_hash TEXT,
  is_claimed BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  merged_into_user_id UUID REFERENCES users(id),
  total_points INT DEFAULT 0,
  events_participated INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz Sessions
CREATE TABLE quiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  join_code TEXT UNIQUE NOT NULL,
  status quiz_status DEFAULT 'draft',
  current_question_index INT DEFAULT -1,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz Questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- ["Option A", "Option B", "Option C", "Option D"]
  correct_index INT NOT NULL, -- 0-3
  time_limit_seconds INT DEFAULT 20,
  points INT DEFAULT 1000,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Responses
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  answer_index INT, -- null if didn't answer in time
  answered_at TIMESTAMPTZ,
  time_taken_ms INT,
  points_awarded INT DEFAULT 0,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, user_id)
);

-- Quiz Participants (tracks who joined which session)
CREATE TABLE quiz_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nickname_used TEXT NOT NULL,
  total_score INT DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quiz_session_id, user_id)
);

-- Indexes
CREATE INDEX idx_talks_event ON talks(event_id);
CREATE INDEX idx_talks_status ON talks(status);
CREATE INDEX idx_quiz_sessions_event ON quiz_sessions(event_id);
CREATE INDEX idx_quiz_sessions_code ON quiz_sessions(join_code);
CREATE INDEX idx_responses_question ON responses(question_id);
CREATE INDEX idx_responses_user ON responses(user_id);
CREATE INDEX idx_users_device ON users(device_id);
CREATE INDEX idx_users_total_points ON users(total_points DESC);
```

---

## Project Structure

```
/
├── app/
│   ├── (public)/                    # Public routes
│   │   ├── page.tsx                 # Landing page
│   │   ├── archive/
│   │   │   ├── page.tsx             # Browse all events
│   │   │   └── [eventId]/
│   │   │       └── page.tsx         # Single event with talks
│   │   ├── leaderboard/
│   │   │   └── page.tsx             # Public leaderboards
│   │   └── play/
│   │       ├── page.tsx             # Join quiz (enter code)
│   │       └── [code]/
│   │           └── page.tsx         # Active quiz gameplay
│   │
│   ├── (speaker)/                   # Speaker routes (magic link auth)
│   │   └── speaker/
│   │       ├── page.tsx             # Speaker dashboard
│   │       └── upload/[talkId]/
│   │           └── page.tsx         # Upload slides
│   │
│   ├── (admin)/                     # Admin routes (protected)
│   │   └── admin/
│   │       ├── page.tsx             # Admin dashboard
│   │       ├── events/
│   │       │   ├── page.tsx         # All events
│   │       │   ├── new/
│   │       │   │   └── page.tsx     # Create event
│   │       │   └── [eventId]/
│   │       │       ├── page.tsx     # Event details
│   │       │       ├── talks/
│   │       │       │   └── page.tsx # Manage submissions
│   │       │       └── quiz/
│   │       │           ├── page.tsx # Quiz setup
│   │       │           └── live/
│   │       │               └── page.tsx # Live quiz control
│   │       └── scoreboard/
│   │           └── page.tsx         # Admin scoreboard view
│   │
│   ├── api/
│   │   ├── cfp/
│   │   │   └── route.ts             # CFP submission
│   │   ├── slides/
│   │   │   └── upload/
│   │   │       └── route.ts         # Copy from Drive to storage
│   │   ├── quiz/
│   │   │   ├── join/
│   │   │   │   └── route.ts         # Join quiz session
│   │   │   └── answer/
│   │   │       └── route.ts         # Submit answer
│   │   └── cron/
│   │       └── reminders/
│   │           └── route.ts         # Reminder cron endpoint
│   │
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── ui/                          # Reusable UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   └── ...
│   ├── quiz/
│   │   ├── question-display.tsx     # Big screen question view
│   │   ├── player-answer.tsx        # Mobile answer buttons
│   │   ├── leaderboard-live.tsx     # Real-time leaderboard
│   │   ├── join-screen.tsx          # QR + code display
│   │   └── timer.tsx                # Countdown timer
│   ├── archive/
│   │   ├── event-card.tsx
│   │   ├── talk-card.tsx
│   │   └── slides-viewer.tsx
│   └── admin/
│       ├── event-form.tsx
│       ├── talk-review-card.tsx
│       ├── quiz-builder.tsx
│       └── upload-status-table.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   ├── server.ts                # Server client
│   │   └── admin.ts                 # Service role client
│   ├── google-drive.ts              # Drive API helpers
│   ├── email.ts                     # Email sending (Resend/etc)
│   ├── scoring.ts                   # Quiz scoring logic
│   └── utils.ts
│
├── hooks/
│   ├── use-quiz-realtime.ts         # Supabase realtime for quiz
│   ├── use-player-session.ts        # Anonymous auth + device ID
│
├── types/
│   └── index.ts                     # TypeScript types
│
└── supabase/
    ├── migrations/                  # SQL migrations
    └── functions/
        └── send-reminders/          # Edge function for cron
```

---

## UI/UX Guidelines

### Design Principles

1. **Simple but creative** - Clean layouts with thoughtful micro-interactions
2. **Performant** - Minimize JS, leverage server components, optimize images
3. **Mobile-first** - Quiz play experience is primarily mobile
4. **Accessible** - Good contrast, keyboard navigation, screen reader friendly

### Visual Style

- **Color palette:** Keep it minimal. One primary brand color, neutral grays, semantic colors for success/error/warning
- **Typography:** Single font family, clear hierarchy (3-4 sizes max)
- **Spacing:** Generous whitespace, consistent spacing scale
- **Cards:** Subtle shadows, rounded corners, hover states
- **Animations:** Subtle and purposeful - page transitions, button feedback, leaderboard position changes

### Key Screens

**Quiz Play (Mobile):**
- Full-screen, distraction-free
- Large tap targets for answer buttons
- Big countdown timer
- Celebratory feedback on correct answers (confetti? color flash?)
- Leaderboard shows position changes with animation

**Quiz Host (Big Screen):**
- Designed for projection
- High contrast, readable from distance
- Large QR code on join screen
- Question + options clearly visible
- Live answer count / leaderboard

**Public Archive:**
- Card grid of events
- Each event expands to show talks
- Slides viewer embedded (PDF.js or Google Slides embed)
- Search/filter without page reload

**Admin Dashboard:**
- Data-dense but organized
- Quick actions accessible
- Status indicators (who uploaded, who hasn't)
- Bulk operations where sensible

---

## Technical Considerations

### Google Drive Integration

To copy files from Drive:
1. Speaker provides a shareable link
2. Extract file ID from URL
3. Use Google Drive API to download (needs service account OR require "anyone with link" access)
4. Upload to Supabase Storage

If file is not accessible, show clear error to speaker.

### Real-time Quiz

Use Supabase Realtime subscriptions:
- Players subscribe to `quiz_sessions` changes (current question index, status)
- Host screen subscribes to `responses` for live answer counts
- Leaderboard subscribes to `quiz_participants` for score updates

### Cron for Reminders

Options:
1. **Supabase Edge Function + pg_cron** - runs in Supabase
2. **Vercel Cron** - if hosting on Vercel
3. **External cron service** - hits an API endpoint

Recommended: Vercel Cron hitting `/api/cron/reminders` (simple, no extra infra)

### Email

Use Resend, Postmark, or similar. Needs:
- Speaker accepted notification
- Slide upload reminders
- (Future: Slack integration)

---

## MVP Scope

### Phase 1: Presentations Core
- [ ] Event CRUD (admin)
- [ ] CFP form (public)
- [ ] Talk review & accept/reject (admin)
- [ ] Speaker dashboard with upload
- [ ] Drive → Storage copy
- [ ] Basic reminder cron
- [ ] Public archive

### Phase 2: Quiz System
- [ ] Quiz builder (admin)
- [ ] Join flow (anonymous auth)
- [ ] Live quiz gameplay
- [ ] Real-time leaderboard
- [ ] Per-event results

### Phase 3: Persistence & Polish
- [ ] Username claiming flow
- [ ] Score merging
- [ ] All-time leaderboards
- [ ] Badges/achievements
- [ ] Admin scoreboard view

### Phase 4: Integrations
- [ ] Slack notifications
- [ ] Email digests
- [ ] Export data

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google (for Drive API)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=

# Email (Resend example)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
CRON_SECRET= # Secure cron endpoints
```

---

## Notes for Claude Code

- Use TypeScript strictly
- Prefer server components where possible
- Use Supabase RLS for authorization (set up policies for admin vs speaker vs public)
- Keep components small and composable
- Write utility functions for repeated logic (scoring, date formatting, etc.)
- Add loading states and error handling throughout
- Test real-time features carefully - connection drops, reconnects, etc.

---

## Questions to Resolve

1. **Branding:** What's the community/platform name? (affects theming, copy)
2. **Slide formats:** Accept only PDF? Or also PPTX, Google Slides links?
3. **Quiz question source:** Where do questions come from? Related to talks or general trivia?
4. **Max players:** Expected concurrent players? (affects Supabase plan)
5. **Domain:** Where will this be hosted?

---

*This brief is ready to hand off to Claude Code for implementation.*

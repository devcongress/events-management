# Community Guide

This guide explains the public side of DevCongress Community.

## Browse Meetups

Open `/events` to see published meetups. Event cards show the date, status, location, cover image, and links for details or external RSVP pages when available.

## Read the Archive

Open `/archive` to browse past meetups and published talks. Event detail pages include talk summaries and slide links when speakers have shared them.

## Submit a Talk

When an event has submissions open, use the event CFP route:

```text
/cfp/:eventId
```

A CFP submission usually includes speaker details, title, topic, abstract, and bio.

## Share Talk Details

After a meetup, organizers can send speakers a post-event archive form:

```text
/speaker-talks/:eventId/:token
```

The form collects speaker details, talk metadata, and an optional public slide link for the event archive. These links expire and can only be submitted once.

## Share Event Feedback

After an event, organizers can open a public feedback form:

```text
/feedback/:eventId
```

Forms may include ratings, text questions, yes/no questions, and talk-picker questions.

## Join a Quiz

The quiz entry points only become useful when a host opens a session:

```text
/play
/play/:code
```

If there is no active quiz, the app shows a waiting/empty state instead of a generic 404.

## Send App Feedback

Testers can use the feedback launcher to report confusing flows, bugs, or suggestions. Feedback includes the current route so maintainers know where the issue happened.

On small screens, the launcher opens the standalone `/feedback` page instead of an overlay so the form has enough space for touch input.

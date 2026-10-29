import type { SkeletonSection } from './types';

export const generalSections: SkeletonSection[] = [
  {
    "id": "public-events-list",
    "label": "public events list",
    "route": "/organizer-console/website-preview/events",
    "sourcePaths": [
      "src/views/EventsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "cards",
        "title": "Community event",
        "count": 2,
        "columns": 2,
        "media": "image",
        "meta": [
          "Thursday, 6:00 PM",
          "Accra, Ghana"
        ],
        "actions": [
          "View event"
        ]
      }
    ]
  },
  {
    "id": "public-dashboard",
    "label": "public dashboard",
    "route": "/",
    "sourcePaths": [
      "src/views/DashboardView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "hero",
        "title": "DEV::CON[]",
        "description": "A community-run space for talks, archives, and monthly meetups.",
        "media": true,
        "action": "Explore talks"
      },
      {
        "kind": "stats",
        "labels": [
          "Community talks",
          "Meetup editions"
        ],
        "columns": 2
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "list",
              "title": "Recent archives",
              "rows": 3
            }
          ],
          [
            {
              "kind": "list",
              "title": "Attendance board",
              "rows": 3
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "public-archive",
    "label": "public archive",
    "route": "/archive",
    "sourcePaths": [
      "src/views/ArchiveView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "tabs",
              "labels": [
                "2026",
                "2025",
                "2024"
              ]
            }
          ],
          [
            {
              "kind": "heading",
              "title": "2026 archives"
            },
            {
              "kind": "toolbar",
              "search": "Search archives",
              "filters": [
                "Type",
                "Month",
                "Speaker"
              ]
            },
            {
              "kind": "list",
              "title": "Community meetup archive",
              "rows": 3,
              "actions": [
                "View archive"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "archive-event-detail",
    "label": "archive event detail",
    "route": "/archive/:eventId",
    "sourcePaths": [
      "src/views/ArchiveEventView.vue"
    ],
    "capture": {
      "maxWidth": 1024,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community meetup archive",
        "description": "Thursday evening \u00b7 Accra"
      },
      {
        "kind": "cards",
        "title": "Session archive",
        "count": 2,
        "columns": 2,
        "media": "none",
        "meta": [
          "Speaker",
          "Session recording"
        ],
        "actions": [
          "Open resource"
        ]
      },
      {
        "kind": "list",
        "title": "Shared links",
        "rows": 2
      }
    ]
  },
  {
    "id": "public-event-detail",
    "label": "public event detail",
    "route": "/organizer-console/website-preview/events/:slug",
    "sourcePaths": [
      "src/views/EventView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "hero",
        "title": "Community meetup",
        "description": "Thursday \u00b7 6:00 PM \u00b7 Accra",
        "media": true,
        "action": "Register"
      },
      {
        "kind": "heading",
        "title": "About this event"
      },
      {
        "kind": "cards",
        "title": "Meet the speakers",
        "count": 2,
        "columns": 2,
        "media": "avatar",
        "meta": [
          "Speaker",
          "Session title"
        ]
      },
      {
        "kind": "list",
        "title": "Event flow",
        "rows": 3
      }
    ]
  },
  {
    "id": "call-for-proposals",
    "label": "call for proposals",
    "route": "/cfp/:eventId",
    "sourcePaths": [
      "src/views/CfpView.vue"
    ],
    "capture": {
      "maxWidth": 768,
      "padding": 32,
      "context": "page",
      "topOffset": 100,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Share your next talk",
        "description": "Submit a session for the community meetup."
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Name"
          },
          {
            "label": "Email"
          },
          {
            "label": "Bio",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "columns": 2,
        "title": "About you"
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Session type",
            "type": "select",
            "fullWidth": false
          },
          {
            "label": "Talk title"
          },
          {
            "label": "Abstract",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Attendee outcomes",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Presentation resource"
          }
        ],
        "columns": 1,
        "title": "Your session",
        "actions": [
          "Submit proposal"
        ]
      }
    ]
  },
  {
    "id": "event-amendment",
    "label": "event amendment",
    "route": "/event-amendments/:capability",
    "sourcePaths": [
      "src/views/EventAmendmentView.vue"
    ],
    "capture": {
      "maxWidth": 896,
      "padding": 32,
      "context": "page",
      "topOffset": 100,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Update your event",
        "description": "Review the event details before submitting your changes."
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Event title"
          },
          {
            "label": "Description",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Format",
            "type": "select",
            "fullWidth": false
          },
          {
            "label": "Start date"
          },
          {
            "label": "End date"
          },
          {
            "label": "Location"
          },
          {
            "label": "Venue"
          },
          {
            "label": "Online URL"
          },
          {
            "label": "Cover image",
            "type": "upload",
            "fullWidth": true
          },
          {
            "label": "Review note",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "columns": 2,
        "actions": [
          "Submit changes"
        ]
      }
    ]
  },
  {
    "id": "event-registration",
    "label": "event registration",
    "route": "/register/:eventId",
    "sourcePaths": [
      "src/views/EventRegistrationView.vue"
    ],
    "capture": {
      "maxWidth": 1024,
      "padding": 32,
      "context": "page",
      "topOffset": 100,
      "publicFormFrame": "center"
    },
    "blocks": [
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "cards",
              "title": "Community meetup",
              "count": 1,
              "columns": 1,
              "media": "image",
              "meta": [
                "Thursday \u00b7 6:00 PM",
                "Accra, Ghana"
              ]
            }
          ],
          [
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Your name"
                },
                {
                  "label": "Email address"
                },
                {
                  "label": "Consent",
                  "type": "toggle",
                  "fullWidth": false
                }
              ],
              "columns": 1,
              "title": "Reserve your place",
              "actions": [
                "Register"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "public-feedback",
    "label": "public feedback",
    "route": "/feedback/:eventId",
    "sourcePaths": [
      "src/views/FeedbackView.vue"
    ],
    "capture": {
      "maxWidth": 896,
      "padding": 32,
      "context": "page",
      "topOffset": 100,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "How was the meetup?",
        "description": "Share anonymous feedback with the organizing team."
      },
      {
        "kind": "section",
        "title": "Overall experience",
        "blocks": [
          {
            "kind": "tabs",
            "labels": [
              "1",
              "2",
              "3",
              "4",
              "5"
            ]
          },
          {
            "kind": "tabs",
            "labels": [
              "Attended",
              "Did not attend"
            ]
          }
        ]
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "What worked well?",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "What could improve?",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "columns": 1,
        "actions": [
          "Submit feedback"
        ]
      }
    ]
  },
  {
    "id": "speaker-talk-intake",
    "label": "speaker talk intake",
    "route": "/speaker-intake/:token",
    "sourcePaths": [
      "src/views/SpeakerTalkIntakeView.vue"
    ],
    "capture": {
      "maxWidth": 1152,
      "padding": 32,
      "context": "page",
      "topOffset": 100,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Your talk materials",
        "description": "Complete your speaker and session information."
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Talk title"
          },
          {
            "label": "Abstract",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Speaker bio",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Presentation resource"
          }
        ],
        "columns": 1,
        "actions": [
          "Save details"
        ]
      }
    ]
  },
  {
    "id": "speaker-talk-intake-conference",
    "label": "speaker talk intake conference",
    "route": "/conference-speakers/:year/:token",
    "sourcePaths": [
      "src/views/SpeakerTalkIntakeView.vue"
    ],
    "capture": {
      "maxWidth": 1152,
      "padding": 32,
      "context": "page",
      "topOffset": 24,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "speaker-conference-intake"
      }
    ]
  },
  {
    "id": "system-design-participant",
    "label": "system design participant",
    "route": "/learn/system-design/:code",
    "sourcePaths": [
      "src/views/SystemDesignParticipantView.vue"
    ],
    "capture": {
      "maxWidth": 496,
      "padding": 16,
      "innerPadding": 8,
      "context": "standalone",
      "topOffset": 0,
      "align": "center"
    },
    "blocks": [
      {
        "kind": "learning-lobby"
      }
    ]
  },
  {
    "id": "admin-feedback-overview",
    "label": "admin feedback overview",
    "route": "/organizer-console/feedback",
    "sourcePaths": [
      "src/views/admin/AdminFeedbackOverviewView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Event feedback"
      },
      {
        "kind": "toolbar",
        "filters": [
          "Reporting year",
          "Month"
        ]
      },
      {
        "kind": "cards",
        "title": "Monthly feedback report",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Meetup",
          "Responses",
          "Average rating"
        ],
        "actions": [
          "Open report"
        ]
      }
    ]
  },
  {
    "id": "admin-talks",
    "label": "admin talks",
    "route": "/organizer-console/events/:eventId/talks/:talksSection",
    "sourcePaths": [
      "src/views/admin/AdminTalksView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Call for proposals"
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Applications open",
            "type": "toggle",
            "fullWidth": false
          },
          {
            "label": "Deadline"
          },
          {
            "label": "Public form link"
          }
        ],
        "columns": 1,
        "actions": [
          "Save changes",
          "Copy link"
        ]
      }
    ]
  },
  {
    "id": "admin-talks-proposals",
    "label": "admin talks proposals",
    "route": "/organizer-console/events/:eventId/talks/:talksSection",
    "sourcePaths": [
      "src/views/admin/AdminTalksView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "toolbar",
        "search": "Search proposals",
        "filters": [
          "Status",
          "Session type"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Proposal",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Speaker",
            "cell": "person"
          },
          {
            "label": "Type",
            "cell": "text"
          },
          {
            "label": "Submitted",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          },
          {
            "label": "Open",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-talks-program",
    "label": "admin talks program",
    "route": "/organizer-console/events/:eventId/talks/:talksSection",
    "sourcePaths": [
      "src/views/admin/AdminTalksView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Talks Archive"
      },
      {
        "kind": "cards",
        "title": "Published talk",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Speaker",
          "Session type",
          "Archive resources"
        ],
        "actions": [
          "View talk"
        ]
      }
    ]
  },
  {
    "id": "admin-talks-backfill",
    "label": "admin talks backfill",
    "route": "/organizer-console/events/:eventId/talks/:talksSection",
    "sourcePaths": [
      "src/views/admin/AdminTalksView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Archive Requests"
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Speaker name"
          },
          {
            "label": "Email"
          },
          {
            "label": "Session title"
          }
        ],
        "columns": 2,
        "actions": [
          "Create archive request"
        ]
      },
      {
        "kind": "list",
        "title": "Active archive requests",
        "rows": 3,
        "actions": [
          "Copy link",
          "Open"
        ]
      }
    ]
  },
  {
    "id": "admin-speakers",
    "label": "admin speakers",
    "route": "/organizer-console/events/:eventId/speakers",
    "sourcePaths": [
      "src/views/admin/AdminSpeakersView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Manage speakers"
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Email"
          },
          {
            "label": "Speaker name"
          }
        ],
        "columns": 1,
        "title": "Add speaker",
        "actions": [
          "Add speaker"
        ]
      },
      {
        "kind": "cards",
        "title": "Approved speaker",
        "count": 3,
        "columns": 3,
        "media": "avatar",
        "meta": [
          "Speaker email"
        ]
      }
    ]
  },
  {
    "id": "admin-organizers",
    "label": "admin organizers",
    "route": "/organizer-console/organizers",
    "sourcePaths": [
      "src/views/admin/AdminOrganizersView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "operations-directory",
        "view": "access"
      }
    ]
  },
  {
    "id": "admin-organizers-owner",
    "label": "admin organizers owner",
    "route": "/organizer-console/organizers",
    "sourcePaths": [
      "src/views/admin/AdminOrganizersView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "operations-directory",
        "view": "access",
        "owner": true
      }
    ]
  },
  {
    "id": "admin-event-detail",
    "label": "admin event detail",
    "route": "/organizer-console/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminEventView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community event",
        "description": "Event operations and publication"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "heading",
              "title": "Overview"
            },
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Event name"
                },
                {
                  "label": "Date"
                },
                {
                  "label": "Location"
                }
              ],
              "columns": 2
            },
            {
              "kind": "list",
              "title": "Shared links",
              "rows": 2
            },
            {
              "kind": "list",
              "title": "Event flow",
              "rows": 3
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Classification"
            },
            {
              "kind": "stats",
              "labels": [
                "Status",
                "Event type"
              ],
              "columns": 2
            },
            {
              "kind": "list",
              "title": "Checklist",
              "rows": 3
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "admin-feedback",
    "label": "admin feedback",
    "route": "/organizer-console/events/:eventId/feedback",
    "sourcePaths": [
      "src/views/admin/AdminFeedbackView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Feedback form",
        "eyebrow": "Event feedback"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Form title"
                },
                {
                  "label": "Introduction",
                  "type": "textarea",
                  "fullWidth": true
                },
                {
                  "label": "Status",
                  "type": "select",
                  "fullWidth": false
                },
                {
                  "label": "Open automatically",
                  "type": "toggle",
                  "fullWidth": false
                }
              ],
              "columns": 1,
              "title": "Feedback configuration"
            },
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Question label"
                },
                {
                  "label": "Question type",
                  "type": "select",
                  "fullWidth": false
                }
              ],
              "columns": 1,
              "title": "Questions"
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Attendee preview"
            },
            {
              "kind": "cards",
              "title": "How was the meetup?",
              "count": 1,
              "columns": 1,
              "media": "none"
            },
            {
              "kind": "tabs",
              "labels": [
                "1",
                "2",
                "3",
                "4",
                "5"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "admin-feedback-responses",
    "label": "admin feedback responses",
    "route": "/organizer-console/events/:eventId/feedback",
    "sourcePaths": [
      "src/views/admin/AdminFeedbackView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Responses",
        "eyebrow": "Event feedback"
      },
      {
        "kind": "stats",
        "labels": [
          "Responses",
          "Overall rating",
          "Return intent"
        ],
        "columns": 3
      },
      {
        "kind": "chart",
        "title": "Experience ratings",
        "chart": "bars"
      },
      {
        "kind": "list",
        "title": "Attendee comments",
        "rows": 3
      }
    ]
  },
  {
    "id": "admin-attendance",
    "label": "admin attendance",
    "route": "/organizer-console/events/:eventId/attendance",
    "sourcePaths": [
      "src/views/admin/AdminAttendanceView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Attendance"
      },
      {
        "kind": "stats",
        "labels": [
          "Registered",
          "Attended",
          "Absent"
        ],
        "columns": 3
      },
      {
        "kind": "toolbar",
        "search": "Search people",
        "filters": [
          "Attendance",
          "Context"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Person",
            "width": "32%",
            "cell": "person"
          },
          {
            "label": "Contact",
            "cell": "text"
          },
          {
            "label": "Attendance",
            "cell": "text"
          },
          {
            "label": "Context",
            "cell": "text"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-audit-log",
    "label": "admin audit log",
    "route": "/organizer-console/audit-log",
    "sourcePaths": [
      "src/views/admin/AdminAuditLogView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "tabs",
        "labels": [
          "Activity",
          "Email delivery",
          "Email previews",
          "Short links",
          "Archived events"
        ],
        "appearance": "underline"
      },
      {
        "kind": "toolbar",
        "search": "Search activity",
        "filters": [
          "Role",
          "From date",
          "To date"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "When",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Role",
            "cell": "text"
          },
          {
            "label": "Email",
            "cell": "text"
          },
          {
            "label": "Activity",
            "cell": "text"
          },
          {
            "label": "Details",
            "cell": "text"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-attendance-overview",
    "label": "admin attendance overview",
    "route": "/organizer-console/attendance",
    "sourcePaths": [
      "src/views/admin/AdminAttendanceOverviewView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Monthly attendance"
      },
      {
        "kind": "toolbar",
        "filters": [
          "Year"
        ]
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "chart",
              "title": "Attendance through the year",
              "chart": "calendar"
            }
          ],
          [
            {
              "kind": "cards",
              "title": "Attendance pattern",
              "count": 2,
              "columns": 1,
              "media": "none"
            }
          ]
        ]
      },
      {
        "kind": "toolbar",
        "search": "Search repeat attendees",
        "filters": [
          "Attendance frequency"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Person",
            "width": "32%",
            "cell": "person"
          },
          {
            "label": "Email",
            "cell": "text"
          },
          {
            "label": "Events",
            "cell": "text"
          },
          {
            "label": "Last seen",
            "cell": "text"
          },
          {
            "label": "Pattern",
            "cell": "text"
          }
        ],
        "rows": 3,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-events-list",
    "label": "admin events list",
    "route": "/organizer-console/events",
    "sourcePaths": [
      "src/views/admin/AdminEventsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "operations-directory",
        "view": "events"
      }
    ]
  },
  {
    "id": "admin-event-submissions",
    "label": "admin event submissions",
    "route": "/organizer-console/events/submissions",
    "sourcePaths": [
      "src/views/admin/AdminEventSubmissionsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Event",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Organizer",
            "cell": "person"
          },
          {
            "label": "Starts",
            "cell": "text"
          },
          {
            "label": "Format",
            "cell": "text"
          },
          {
            "label": "Location",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          },
          {
            "label": "Open",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-community-event-detail",
    "label": "admin community event detail",
    "route": "/organizer-console/events/:eventId/community",
    "sourcePaths": [
      "src/views/admin/AdminCommunityEventView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community event",
        "description": "Event proposal details"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "cards",
              "title": "Event cover",
              "count": 1,
              "columns": 1,
              "media": "image"
            },
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Event title"
                },
                {
                  "label": "Starts"
                },
                {
                  "label": "Location"
                },
                {
                  "label": "Description",
                  "type": "textarea",
                  "fullWidth": true
                }
              ],
              "columns": 2
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Review and publication"
            },
            {
              "kind": "stats",
              "labels": [
                "Review status",
                "Website"
              ],
              "columns": 2
            },
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Review note",
                  "type": "textarea",
                  "fullWidth": true
                }
              ],
              "columns": 1,
              "actions": [
                "Approve",
                "Request changes"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "admin-system-design",
    "label": "admin system design",
    "route": "/organizer-console/events/:eventId/system-design",
    "sourcePaths": [
      "src/views/admin/AdminSystemDesignView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "form",
              "fields": [
                {
                  "label": "Session title"
                },
                {
                  "label": "Description",
                  "type": "textarea",
                  "fullWidth": true
                },
                {
                  "label": "Source URL"
                },
                {
                  "label": "Facilitators"
                }
              ],
              "columns": 1,
              "title": "Monthly artifact",
              "actions": [
                "Save artifact"
              ]
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Session preview"
            },
            {
              "kind": "cards",
              "title": "System Design session",
              "count": 1,
              "columns": 1,
              "media": "none"
            }
          ]
        ]
      },
      {
        "kind": "heading",
        "title": "Prepare live room"
      },
      {
        "kind": "toolbar",
        "actions": [
          "Generate questions",
          "Add question",
          "Present"
        ]
      }
    ]
  },
  {
    "id": "admin-registration-workspace",
    "label": "admin registration workspace",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue",
      "src/styles/registration-workspace.css"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "registration-summary"
      }
    ]
  },
  {
    "id": "admin-registration-workspace-guests",
    "label": "admin registration workspace guests",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "toolbar",
        "search": "Name or email",
        "filters": [
          "Status",
          "A\u2013Z"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Guest",
            "width": "32%",
            "cell": "person"
          },
          {
            "label": "Email",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          },
          {
            "label": "Registered",
            "cell": "text"
          },
          {
            "label": "Actions",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-registration-workspace-form",
    "label": "admin registration workspace form",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "form",
        "fields": [
          {
            "label": "Registration title"
          },
          {
            "label": "Introduction",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Capacity"
          },
          {
            "label": "Registration open",
            "type": "toggle",
            "fullWidth": false
          }
        ],
        "columns": 2,
        "title": "Form and capacity",
        "actions": [
          "Save settings"
        ]
      }
    ]
  },
  {
    "id": "admin-registration-workspace-emails",
    "label": "admin registration workspace emails",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "stats",
        "labels": [
          "Accepted",
          "Failed",
          "Pending"
        ],
        "columns": 3
      },
      {
        "kind": "toolbar",
        "search": "Recipient email",
        "filters": [
          "Delivery status"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Recipient",
            "width": "32%",
            "cell": "person"
          },
          {
            "label": "Email",
            "cell": "text"
          },
          {
            "label": "Sent",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          },
          {
            "label": "Actions",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-registration-workspace-blasts",
    "label": "admin registration workspace blasts",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "stats",
        "labels": [
          "Audience",
          "Available today"
        ],
        "columns": 2
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Subject"
          },
          {
            "label": "Message",
            "type": "textarea",
            "fullWidth": true
          },
          {
            "label": "Daily allocation"
          }
        ],
        "columns": 1,
        "title": "Email blast",
        "actions": [
          "Preview blast"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Blast",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Audience",
            "cell": "text"
          },
          {
            "label": "Last updated",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          }
        ],
        "rows": 3,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-present-forms-board-1",
    "label": "admin present forms board 1",
    "route": "/organizer-console/present-forms/display",
    "sourcePaths": [
      "src/views/admin/AdminFormBoardDisplayView.vue"
    ],
    "capture": {
      "maxWidth": 1536,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "form-board",
        "count": 1
      }
    ]
  },
  {
    "id": "admin-present-forms-board-2",
    "label": "admin present forms board 2",
    "route": "/organizer-console/present-forms/display",
    "sourcePaths": [
      "src/views/admin/AdminFormBoardDisplayView.vue"
    ],
    "capture": {
      "maxWidth": 1536,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "form-board",
        "count": 2
      }
    ]
  },
  {
    "id": "admin-present-forms-board-3",
    "label": "admin present forms board 3",
    "route": "/organizer-console/present-forms/display",
    "sourcePaths": [
      "src/views/admin/AdminFormBoardDisplayView.vue"
    ],
    "capture": {
      "maxWidth": 1536,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "form-board",
        "count": 3
      }
    ]
  },
  {
    "id": "organizer-mobile-next-actions",
    "label": "organizer mobile next actions",
    "route": "/organizer-console/mobile",
    "sourcePaths": [
      "src/views/admin/AdminMobileOrganizerView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "cards",
        "title": "Your next organizer action",
        "count": 2,
        "columns": 1,
        "media": "none",
        "meta": [
          "Today",
          "Event operations"
        ],
        "actions": [
          "Open"
        ]
      }
    ]
  },
  {
    "id": "mobile-events-list",
    "label": "mobile events list",
    "route": "/organizer-console/mobile/events",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventsView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "cards",
        "title": "Community meetup",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Upcoming meetup",
          "Thursday \u00b7 6:00 PM"
        ],
        "actions": [
          "Guest list",
          "Open event"
        ]
      }
    ]
  },
  {
    "id": "mobile-event-detail",
    "label": "mobile event detail",
    "route": "/organizer-console/mobile/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community meetup",
        "description": "Thursday \u00b7 6:00 PM \u00b7 Accra"
      },
      {
        "kind": "tabs",
        "labels": [
          "Overview",
          "Guests",
          "Submissions"
        ]
      },
      {
        "kind": "cards",
        "title": "Event operations",
        "count": 1,
        "columns": 1,
        "media": "none",
        "meta": [
          "Registration",
          "Presentation proposals"
        ],
        "actions": [
          "Guest check-in mode"
        ]
      },
      {
        "kind": "list",
        "title": "Next actions",
        "rows": 2
      }
    ]
  },
  {
    "id": "mobile-event-detail-guests",
    "label": "mobile event detail guests",
    "route": "/organizer-console/mobile/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community meetup",
        "description": "Thursday \u00b7 6:00 PM \u00b7 Accra"
      },
      {
        "kind": "tabs",
        "labels": [
          "Overview",
          "Guests",
          "Submissions"
        ]
      },
      {
        "kind": "toolbar",
        "search": "Name or email"
      },
      {
        "kind": "list",
        "title": "Registered guests",
        "rows": 3,
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "mobile-event-detail-submissions",
    "label": "mobile event detail submissions",
    "route": "/organizer-console/mobile/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community meetup",
        "description": "Thursday \u00b7 6:00 PM \u00b7 Accra"
      },
      {
        "kind": "tabs",
        "labels": [
          "Overview",
          "Guests",
          "Submissions"
        ]
      },
      {
        "kind": "cards",
        "title": "Presentation proposal",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Speaker",
          "Session type",
          "Submitted"
        ],
        "actions": [
          "Review"
        ]
      }
    ]
  },
  {
    "id": "mobile-check-in-guests",
    "label": "mobile check in guests",
    "route": "/organizer-console/mobile/events/:eventId/check-in",
    "sourcePaths": [
      "src/views/admin/AdminMobileCheckInView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "toolbar",
        "search": "Name or email",
        "filters": [
          "All",
          "Registered",
          "A\u2013Z"
        ]
      },
      {
        "kind": "stats",
        "labels": [
          "Checked in",
          "Registered"
        ],
        "columns": 2
      },
      {
        "kind": "list",
        "title": "Guest name",
        "rows": 3,
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "mobile-blasts-audience",
    "label": "mobile blasts audience",
    "route": "/organizer-console/mobile/events/:eventId/blasts",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventBlastsView.vue"
    ],
    "capture": {
      "maxWidth": 640,
      "padding": 16,
      "context": "phone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "stats",
        "labels": [
          "Audience",
          "Safe today"
        ],
        "columns": 2
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Allocate today"
          }
        ],
        "columns": 1,
        "title": "Delivery capacity",
        "actions": [
          "Save allocation"
        ]
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Subject"
          },
          {
            "label": "Message",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "columns": 1,
        "title": "Compose blast",
        "actions": [
          "Preview"
        ]
      }
    ]
  },
  {
    "id": "system-design-presenter",
    "label": "system design presenter",
    "route": "/present/system-design/:sessionId",
    "sourcePaths": [
      "src/views/SystemDesignPresenterView.vue"
    ],
    "capture": {
      "maxWidth": 1600,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "System Design",
        "description": "Live learning room"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "heading",
              "title": "Join the room"
            },
            {
              "kind": "qr",
              "count": 1
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Participants"
            },
            {
              "kind": "cards",
              "title": "Participant name",
              "count": 4,
              "columns": 2,
              "media": "avatar"
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "system-design-recap",
    "label": "system design recap",
    "route": "/system-design/:eventId",
    "sourcePaths": [
      "src/views/SystemDesignRecapView.vue"
    ],
    "capture": {
      "maxWidth": 896,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "System Design learning recap",
        "description": "Facilitated by the community"
      },
      {
        "kind": "toolbar",
        "actions": [
          "Open session docs"
        ]
      },
      {
        "kind": "section",
        "title": "Question 1",
        "blocks": [
          {
            "kind": "cards",
            "title": "Answer option",
            "count": 4,
            "columns": 2,
            "media": "none"
          },
          {
            "kind": "heading",
            "title": "Explanation"
          }
        ]
      }
    ]
  },
  {
    "id": "admin-email-previews",
    "label": "admin email previews",
    "route": "/organizer-console/audit-log?tab=email-previews",
    "sourcePaths": [
      "src/views/admin/AdminEmailPreviewsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "topOffset": 100
    },
    "blocks": [
      { "kind": "heading", "title": "Email previews", "description": "Choose a template and send a test" },
      { "kind": "toolbar", "filters": ["Email template", "Visual", "Desktop"] },
      { "kind": "cards", "title": "Email message preview", "count": 1, "columns": 1, "media": "none", "meta": ["From", "Subject", "Message"] }
    ]
  },
  {
    "id": "admin-present-forms-choices",
    "label": "admin present forms choices",
    "route": "/organizer-console/present-forms",
    "sourcePaths": [
      "src/views/admin/AdminPresentFormsView.vue"
    ],
    "capture": {
      "maxWidth": 1024,
      "padding": 32,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "cards",
        "title": "Available community form",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Select for the audience board"
        ]
      }
    ]
  },
  {
    "id": "admin-feedback-display",
    "label": "admin feedback display",
    "route": "/organizer-console/feedback-display/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminFeedbackDisplayView.vue"
    ],
    "capture": {
      "maxWidth": 1536,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "How was the meetup?"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "qr",
              "count": 1
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Community meetup",
              "description": "Thursday \u00b7 6:00 PM \u00b7 Accra"
            },
            {
              "kind": "toolbar",
              "actions": [
                "Open form"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "admin-registration-display",
    "label": "admin registration display",
    "route": "/organizer-console/registration-display/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationDisplayView.vue"
    ],
    "capture": {
      "maxWidth": 1536,
      "padding": 32,
      "context": "standalone",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Register for this meetup"
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "qr",
              "count": 1
            }
          ],
          [
            {
              "kind": "heading",
              "title": "Community meetup",
              "description": "Thursday \u00b7 6:00 PM \u00b7 Accra"
            },
            {
              "kind": "toolbar",
              "actions": [
                "Open form"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "project-night-recurrence",
    "label": "project night recurrence",
    "route": "/organizer-console/events/:eventId",
    "sourcePaths": [
      "src/components/ProjectNightRecurrencePanel.vue"
    ],
    "capture": {
      "maxWidth": 960,
      "padding": 20,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Next occurrence",
        "level": "section",
        "description": "Thursday, 29 October 2026"
      },
      {
        "kind": "section",
        "plain": true,
        "description": "Reuse the last Project Night announcement image.",
        "blocks": [
          {
            "kind": "toolbar",
            "actions": [
              "Pause recurrence",
              "Skip next week"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "admin-access-requests",
    "label": "admin access requests",
    "route": "/organizer-console/organizers",
    "sourcePaths": [
      "src/views/admin/AdminOrganizersView.vue"
    ],
    "capture": {
      "maxWidth": 1216,
      "padding": 32,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Person",
            "width": "32%",
            "cell": "person"
          },
          {
            "label": "How they would help",
            "cell": "text"
          },
          {
            "label": "Requested",
            "cell": "text"
          },
          {
            "label": "Review",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-conference-responsibilities",
    "label": "admin conference responsibilities",
    "route": "/organizer-console/organizers",
    "sourcePaths": [
      "src/views/admin/AdminOrganizersView.vue"
    ],
    "capture": {
      "maxWidth": 960,
      "padding": 24,
      "context": "drawer",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "section",
        "plain": true,
        "title": "Programme and speakers",
        "blocks": [
          {
            "kind": "form",
            "columns": 1,
            "fields": [
              {
                "label": "Manage programme and speakers",
                "type": "toggle"
              },
              {
                "label": "Manage volunteers",
                "type": "toggle"
              },
              {
                "label": "Manage registration and check-in",
                "type": "toggle"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "admin-short-links",
    "label": "admin short links",
    "route": "/organizer-console/audit-log?tab=short-links",
    "sourcePaths": [
      "src/components/admin/AdminShortLinksState.vue"
    ],
    "capture": {
      "maxWidth": 1216,
      "padding": 32,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Destination",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Form",
            "cell": "text"
          },
          {
            "label": "Link",
            "cell": "text"
          },
          {
            "label": "Visits",
            "cell": "text"
          },
          {
            "label": "Last visited",
            "cell": "text"
          },
          {
            "label": "Actions",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "admin-archived-events",
    "label": "admin archived events",
    "route": "/organizer-console/audit-log",
    "sourcePaths": [
      "src/views/admin/AdminAuditLogView.vue"
    ],
    "capture": {
      "maxWidth": 1216,
      "padding": 32,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Event",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Archived",
            "cell": "text"
          },
          {
            "label": "Restore window",
            "cell": "text"
          },
          {
            "label": "State",
            "cell": "badge"
          },
          {
            "label": "Actions",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "mobile-event-guests",
    "label": "mobile event guests",
    "route": "/organizer-console/mobile/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventView.vue"
    ],
    "capture": {
      "maxWidth": 608,
      "padding": 16,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "toolbar",
        "search": "Name or email"
      },
      {
        "kind": "list",
        "title": "Guest name",
        "rows": 3,
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "mobile-event-submissions",
    "label": "mobile event submissions",
    "route": "/organizer-console/mobile/events/:eventId",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventView.vue"
    ],
    "capture": {
      "maxWidth": 608,
      "padding": 16,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "cards",
        "title": "Presentation proposal",
        "count": 3,
        "columns": 1,
        "media": "none",
        "meta": [
          "Speaker",
          "Session type",
          "Status",
          "Submitted"
        ],
        "actions": [
          "Review"
        ]
      }
    ]
  },
  {
    "id": "mobile-blast-history",
    "label": "mobile blast history",
    "route": "/organizer-console/mobile/events/:eventId/blasts",
    "sourcePaths": [
      "src/views/admin/AdminMobileEventBlastsView.vue"
    ],
    "capture": {
      "maxWidth": 608,
      "padding": 16,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "list",
        "title": "Recent blast",
        "rows": 3,
        "actions": [
          "View activity"
        ]
      }
    ]
  },
  {
    "id": "event-blast-history",
    "label": "event blast history",
    "route": "/organizer-console/events/:eventId/registrations",
    "sourcePaths": [
      "src/views/admin/AdminRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1216,
      "padding": 32,
      "context": "panel",
      "topOffset": 100
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Blast",
            "width": "32%",
            "cell": "text"
          },
          {
            "label": "Audience",
            "cell": "text"
          },
          {
            "label": "Last updated",
            "cell": "text"
          },
          {
            "label": "Status",
            "cell": "badge"
          }
        ],
        "rows": 4,
        "mobile": "scroll"
      }
    ]
  }
];

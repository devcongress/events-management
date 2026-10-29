import type { SkeletonSection } from './types';

export const conferenceSections: SkeletonSection[] = [
  {
    "id": "annual-conference-overview",
    "label": "annual conference overview",
    "route": "/organizer-console/annual-conference/2026",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Saturday, 19 December 2026",
        "eyebrow": "2026 edition",
        "action": "Planning notes \u00b7 02",
        "level": "page"
      },
      {
        "kind": "split",
        "ratio": "content-sidebar",
        "blocks": [
          [
            {
              "kind": "heading",
              "title": "Tasks complete",
              "eyebrow": "Delivery",
              "level": "section"
            },
            {
              "kind": "progress",
              "label": "Work plan completion"
            },
            {
              "kind": "toolbar",
              "actions": [
                "Need an owner",
                "Blocked"
              ]
            }
          ],
          [
            {
              "kind": "toolbar",
              "actions": [
                "Open work plan"
              ]
            }
          ]
        ]
      },
      {
        "kind": "split",
        "ratio": "sidebar",
        "blocks": [
          [
            {
              "kind": "heading",
              "title": "What needs to happen next",
              "eyebrow": "Dependency pulse",
              "action": "Manage dependencies",
              "level": "section"
            },
            {
              "kind": "stats",
              "labels": [
                "Links",
                "Waiting",
                "Ready"
              ],
              "columns": 3,
              "compact": true
            }
          ],
          [
            {
              "kind": "list",
              "rows": 3,
              "secondary": "Prerequisite \u2192 Unblocks",
              "actions": [
                "Open task"
              ]
            }
          ]
        ]
      },
      {
        "kind": "heading",
        "title": "Completion by assignee",
        "eyebrow": "Team workload",
        "level": "section"
      },
      {
        "kind": "cards",
        "count": 3,
        "columns": 3,
        "title": "Accountable owner",
        "meta": [
          "Pending tasks",
          "Complete of assigned"
        ],
        "actions": [
          "View tasks"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-overview-assigned",
    "label": "annual conference overview assigned",
    "route": "/organizer-console/annual-conference/2026",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Saturday, 19 December 2026",
        "eyebrow": "Your conference work",
        "description": "Your assigned tasks and progress, in one focused place.",
        "level": "page"
      },
      {
        "kind": "split",
        "ratio": "content-sidebar",
        "blocks": [
          [
            {
              "kind": "heading",
              "title": "Tasks complete",
              "eyebrow": "Your work",
              "level": "section"
            },
            {
              "kind": "progress",
              "label": "Assigned work plan completion"
            },
            {
              "kind": "toolbar",
              "actions": [
                "Tasks assigned to you",
                "Tasks blocked"
              ]
            }
          ],
          [
            {
              "kind": "toolbar",
              "actions": [
                "Open work plan"
              ]
            }
          ]
        ]
      }
    ]
  },
  {
    "id": "annual-conference-work-plan",
    "label": "annual conference work plan",
    "route": "/organizer-console/annual-conference/2026/work-plan",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceWorkPlanView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "work-plan",
        "view": "ledger"
      }
    ]
  },
  {
    "id": "annual-conference-work-plan-board",
    "label": "annual conference work plan board",
    "route": "/organizer-console/annual-conference/2026/work-plan",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceWorkPlanView.vue",
      "src/components/AnnualConferenceTaskBoard.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "work-plan",
        "view": "board"
      }
    ]
  },
  {
    "id": "annual-conference-finance",
    "label": "annual conference finance",
    "route": "/organizer-console/annual-conference/2026/finance",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceFinanceView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Money at a glance",
        "eyebrow": "Conference finance",
        "action": "Add record",
        "level": "page",
        "description": "Values are stored in Ghana cedis. Planned budget, committed spend, paid spend, and income stay separate."
      },
      {
        "kind": "stats",
        "labels": [
          "Planned budget",
          "Committed",
          "Paid",
          "Remaining"
        ],
        "columns": 4,
        "details": [
          "Budget lines entered",
          "Approved or paid expenses",
          "Still unpaid",
          "Budget less committed spend"
        ]
      },
      {
        "kind": "split",
        "ratio": "content-sidebar",
        "blocks": [
          [
            {
              "kind": "section",
              "title": "By category",
              "blocks": [
                {
                  "kind": "table",
                  "columns": [
                    {
                      "label": "Category",
                      "width": "40%"
                    },
                    {
                      "label": "Budget",
                      "width": "20%",
                      "cell": "number"
                    },
                    {
                      "label": "Committed",
                      "width": "20%",
                      "cell": "number"
                    },
                    {
                      "label": "Variance",
                      "width": "20%",
                      "cell": "number"
                    }
                  ],
                  "rows": 3,
                  "mobile": "scroll"
                }
              ]
            }
          ],
          [
            {
              "kind": "section",
              "title": "What is coming in",
              "blocks": [
                {
                  "kind": "list",
                  "rows": 3,
                  "labels": [
                    "Expected",
                    "Received",
                    "Cash position"
                  ],
                  "compact": true
                }
              ]
            }
          ]
        ]
      },
      {
        "kind": "section",
        "title": "Recent records",
        "blocks": [
          {
            "kind": "table",
            "columns": [
              {
                "label": "Record",
                "width": "26%"
              },
              {
                "label": "Category",
                "width": "14%"
              },
              {
                "label": "Source",
                "width": "14%"
              },
              {
                "label": "Status",
                "width": "12%",
                "cell": "badge"
              },
              {
                "label": "Date",
                "width": "12%",
                "cell": "date"
              },
              {
                "label": "Amount",
                "width": "14%",
                "cell": "number"
              },
              {
                "label": "Actions",
                "width": "8%",
                "cell": "action"
              }
            ],
            "rows": 3,
            "mobile": "cards"
          }
        ]
      }
    ]
  },
  {
    "id": "annual-conference-speakers",
    "label": "annual conference speakers",
    "route": "/organizer-console/annual-conference/2026/speakers",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceSpeakersView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Call for Speakers",
        "eyebrow": "Annual Conference",
        "description": "Review proposals and manage the public call.",
        "action": "Open form \u00b7 Copy public link \u00b7 Close call",
        "level": "page"
      },
      {
        "kind": "form",
        "columns": 1,
        "fields": [
          {
            "label": "Speaker logistics deadline",
            "type": "input",
            "fullWidth": false
          }
        ],
        "actions": [
          "Save deadline"
        ],
        "description": "Accepted speakers can save and revise their private workspace until this deadline."
      },
      {
        "kind": "toolbar",
        "actions": [
          "Pending",
          "Approved",
          "Rejected"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Proposal",
            "width": "40%"
          },
          {
            "label": "Speaker",
            "width": "20%",
            "cell": "text"
          },
          {
            "label": "Type",
            "width": "10%",
            "cell": "text"
          },
          {
            "label": "Submitted",
            "width": "11%",
            "cell": "date"
          },
          {
            "label": "Status",
            "width": "12%",
            "cell": "badge"
          },
          {
            "label": "Open",
            "width": "7%",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "annual-conference-registrations",
    "label": "annual conference registrations",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue",
      "src/styles/registration-workspace.css"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "registration-summary"
      }
    ]
  },
  {
    "id": "annual-conference-registrations-guests",
    "label": "annual conference registrations guests",
    "route": "/organizer-console/annual-conference/2026/registrations?section=guests",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue",
      "src/components/AnnualConferenceGuests.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "toolbar",
        "actions": [
          "Checked in count",
          "Refresh",
          "Scan with camera"
        ]
      },
      {
        "kind": "toolbar",
        "search": "Name or email",
        "actions": [
          "All",
          "Confirmed",
          "Waitlisted",
          "Cancelled",
          "Not checked in",
          "Checked in"
        ]
      },
      {
        "kind": "tabs",
        "labels": [
          "All",
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
          "H",
          "I",
          "J",
          "K",
          "L",
          "M",
          "N",
          "O",
          "P",
          "Q",
          "R",
          "S",
          "T",
          "U",
          "V",
          "W",
          "X",
          "Y",
          "Z"
        ]
      },
      {
        "kind": "list",
        "rows": 4,
        "secondary": "Attendee name \u00b7 email \u00b7 admission status",
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registrations-form",
    "label": "annual conference registrations form",
    "route": "/organizer-console/annual-conference/2026/registrations?section=form",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "form",
        "title": "Form & capacity",
        "columns": 1,
        "fields": [
          {
            "label": "Venue capacity",
            "type": "input",
            "fullWidth": false
          }
        ],
        "actions": [
          "Save capacity"
        ]
      },
      {
        "kind": "form",
        "columns": 2,
        "fields": [
          {
            "label": "Registration mode",
            "type": "select",
            "fullWidth": false
          },
          {
            "label": "Availability",
            "type": "select",
            "fullWidth": false
          }
        ],
        "actions": [
          "Review settings"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registrations-emails",
    "label": "annual conference registrations emails",
    "route": "/organizer-console/annual-conference/2026/registrations?section=emails",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue",
      "src/components/AnnualConferenceRegistrationEmails.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Registration emails",
        "description": "Admission confirmations and waitlist notices",
        "level": "section",
        "eyebrow": "Transactional only",
        "action": "Refresh"
      },
      {
        "kind": "stats",
        "labels": [
          "Accepted by provider",
          "Delivered",
          "Queued / sending",
          "Failed"
        ],
        "columns": 4
      },
      {
        "kind": "toolbar",
        "search": "Recipient email",
        "actions": [
          "Search"
        ]
      },
      {
        "kind": "toolbar",
        "filters": [
          "Delivery status"
        ]
      },
      {
        "kind": "list",
        "rows": 4,
        "secondary": "Recipient email \u00b7 message kind",
        "actions": [
          "Details"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registrations-blasts",
    "label": "annual conference registrations blasts",
    "route": "/organizer-console/annual-conference/2026/registrations?section=blasts",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Blasts",
        "description": "Updates for confirmed conference guests",
        "action": "Create blast",
        "level": "section"
      },
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Audience \u00b7 delivery status",
        "actions": [
          "View activity"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registrations-community",
    "label": "annual conference registrations community",
    "route": "/organizer-console/annual-conference/2026/registrations?section=community",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue",
      "src/components/AnnualConferenceCommunityTickets.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Community-funded tickets",
        "description": "Supporters and ticket recipients",
        "level": "section"
      },
      {
        "kind": "toolbar",
        "filters": [
          "Payment mode"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Supporter",
            "width": "28%",
            "cell": "person"
          },
          {
            "label": "Purchase",
            "width": "25%"
          },
          {
            "label": "Assignment progress",
            "width": "29%",
            "cell": "number"
          },
          {
            "label": "Actions",
            "width": "18%",
            "cell": "action"
          }
        ],
        "rows": 3,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "annual-conference-ticketing",
    "label": "annual conference ticketing",
    "route": "/organizer-console/annual-conference/2026/ticketing",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "section",
        "title": "Every reserved seat accounted for",
        "blocks": [
          {
            "kind": "stats",
            "labels": [
              "Capacity",
              "Reserved",
              "Available"
            ],
            "columns": 3,
            "details": [
              "Total seats available to this edition",
              "Paid, sponsor-held, and active checkout holds",
              "Seats not yet committed"
            ]
          },
          {
            "kind": "stats",
            "labels": [
              "Paid seats",
              "Sponsor holds",
              "Active checkouts"
            ],
            "columns": 3,
            "compact": true
          }
        ],
        "plain": true
      },
      {
        "kind": "split",
        "ratio": "content-sidebar",
        "blocks": [
          [
            {
              "kind": "form",
              "title": "Venue-safe public inventory",
              "columns": 1,
              "fields": [
                {
                  "label": "New capacity",
                  "type": "input",
                  "fullWidth": false
                }
              ],
              "actions": [
                "Save capacity"
              ]
            }
          ],
          [
            {
              "kind": "section",
              "title": "Activation status",
              "blocks": [
                {
                  "kind": "list",
                  "rows": 3,
                  "labels": [
                    "Ticketing data",
                    "Checkout",
                    "Merchant setup"
                  ],
                  "compact": true
                }
              ]
            }
          ]
        ]
      },
      {
        "kind": "section",
        "title": "Pricing",
        "blocks": [
          {
            "kind": "table",
            "columns": [
              {
                "label": "Individual ticket",
                "width": "60%"
              },
              {
                "label": "Price",
                "width": "20%",
                "cell": "number"
              },
              {
                "label": "GHS \u00b7 per person",
                "width": "20%"
              }
            ],
            "rows": 1,
            "mobile": "cards"
          }
        ]
      }
    ]
  },
  {
    "id": "annual-conference-ticketing-orders",
    "label": "conference ticketing orders",
    "route": "/organizer-console/annual-conference/2026/ticketing?section=orders",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue",
      "src/components/ui/BoneyardTicketOrdersFixture.vue",
      "src/styles/ticket-order-cards.css"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Ticket orders",
        "description": "Paid orders, delivery state, and check-in progress.",
        "eyebrow": "Admissions operations",
        "level": "section"
      },
      {
        "kind": "ticket-orders",
        "rows": 5
      }
    ]
  },
  {
    "id": "annual-conference-ticketing-delivery",
    "label": "conference ticketing delivery",
    "route": "/organizer-console/annual-conference/2026/ticketing?section=delivery",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Delivery health",
        "description": "All ticket-email activity for this conference. Provider acceptance is not proof of inbox delivery.",
        "eyebrow": "Ticket email delivery",
        "level": "section"
      },
      {
        "kind": "toolbar",
        "filters": [
          "All"
        ],
        "actions": [
          "Refresh"
        ]
      },
      {
        "kind": "stats",
        "labels": [
          "Queued",
          "Accepted",
          "Delivered",
          "Needs review"
        ],
        "columns": 4,
        "compact": true
      },
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Recipient email \u00b7 latest delivery activity",
        "actions": [
          "Retry"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-ticketing-sponsors",
    "label": "conference ticketing sponsors",
    "route": "/organizer-console/annual-conference/2026/ticketing?section=sponsors",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Reserve private sponsor tickets",
        "description": "These seats are held in the inventory ledger immediately and are not public pass types.",
        "eyebrow": "Sponsor allocations",
        "level": "section"
      },
      {
        "kind": "form",
        "fields": [
          {
            "label": "Sponsor"
          },
          {
            "label": "Contact name"
          },
          {
            "label": "Contact email"
          },
          {
            "label": "Seats"
          }
        ],
        "columns": 4,
        "actions": [
          "Reserve sponsor tickets"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Sponsor",
            "width": "45%"
          },
          {
            "label": "Seats",
            "width": "15%",
            "cell": "number"
          },
          {
            "label": "Contact",
            "width": "40%",
            "cell": "person"
          }
        ],
        "rows": 3,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "annual-conference-ticketing-testing",
    "label": "conference ticketing testing",
    "route": "/organizer-console/annual-conference/2026/ticketing?section=testing",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue",
      "src/components/Devcon26TestCoupons.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Test checkout coupons",
        "description": "Create discounts for test payments. These checkouts do not issue admission tickets.",
        "eyebrow": "Test checkout",
        "level": "section"
      },
      {
        "kind": "toolbar",
        "actions": [
          "Create a test coupon"
        ]
      },
      {
        "kind": "section",
        "title": "Checkout coupon",
        "blocks": [
          {
            "kind": "heading",
            "title": "TEST CODE",
            "description": "Discount \u00b7 expiry \u00b7 eligible passes",
            "action": "Disable",
            "level": "section"
          },
          {
            "kind": "stats",
            "labels": [
              "Completed / maximum",
              "Active holds",
              "Remaining uses",
              "Needs attention"
            ],
            "columns": 4
          }
        ]
      },
      {
        "kind": "heading",
        "title": "Test checkout activity",
        "level": "section"
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Checkout",
            "width": "28%",
            "cell": "date"
          },
          {
            "label": "Pass / coupon",
            "width": "25%"
          },
          {
            "label": "Amount",
            "width": "17%",
            "cell": "number"
          },
          {
            "label": "Status",
            "width": "18%",
            "cell": "badge"
          },
          {
            "label": "Details",
            "width": "12%",
            "cell": "action"
          }
        ],
        "rows": 2,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "annual-conference-volunteers",
    "label": "annual conference volunteers",
    "route": "/organizer-console/annual-conference/2026/volunteers",
    "sourcePaths": [
      "src/views/admin/AdminVolunteerView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Volunteer directory",
        "description": "Active team members and applicants in one list.",
        "level": "section"
      },
      {
        "kind": "toolbar",
        "search": "Search name, email, X or Slack",
        "actions": [
          "All",
          "Active",
          "Applicants"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Name",
            "width": "22%",
            "cell": "text"
          },
          {
            "label": "Status",
            "width": "13%",
            "cell": "badge"
          },
          {
            "label": "Email",
            "width": "23%"
          },
          {
            "label": "X",
            "width": "11%"
          },
          {
            "label": "Slack",
            "width": "13%"
          },
          {
            "label": "Signed up",
            "width": "12%",
            "cell": "date"
          },
          {
            "label": "Open",
            "width": "6%",
            "cell": "action"
          }
        ],
        "rows": 4,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "volunteer-follow-up-campaign",
    "label": "volunteer follow up campaign",
    "route": "/organizer-console/annual-conference/2026/volunteers",
    "sourcePaths": [
      "src/components/VolunteerFollowUpPanel.vue",
      "src/components/VolunteerBroadcastPanel.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "tabs",
        "labels": [
          "Volunteer updates",
          "Outcome emails",
          "Invitations",
          "Settings"
        ]
      },
      {
        "kind": "heading",
        "title": "Volunteer updates",
        "eyebrow": "Owner \u00b7 Selected volunteers",
        "description": "Write an update, choose accepted volunteers, and review it before sending.",
        "level": "section"
      },
      {
        "kind": "split",
        "ratio": "equal",
        "blocks": [
          [
            {
              "kind": "form",
              "columns": 1,
              "fields": [
                {
                  "label": "Subject",
                  "type": "input",
                  "fullWidth": false
                },
                {
                  "label": "Message",
                  "type": "textarea",
                  "fullWidth": false
                },
                {
                  "label": "Schedule (optional)",
                  "type": "input",
                  "fullWidth": false
                }
              ],
              "actions": [
                "Preview update"
              ]
            }
          ],
          [
            {
              "kind": "toolbar",
              "search": "Search accepted volunteers",
              "actions": [
                "Select all",
                "Clear"
              ]
            },
            {
              "kind": "list",
              "rows": 4,
              "secondary": "Email \u00b7 selected recipient"
            }
          ]
        ]
      },
      {
        "kind": "section",
        "title": "Broadcast activity",
        "blocks": [
          {
            "kind": "list",
            "rows": 2,
            "secondary": "Audience \u00b7 status \u00b7 sent date"
          }
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-workspace",
    "label": "mobile conference workspace",
    "route": "/organizer-console/mobile/annual-conference/2026",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 16,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "toolbar",
        "actions": [
          "Open Registration",
          "Ticketing"
        ]
      },
      {
        "kind": "toolbar",
        "actions": [
          "Open Registration"
        ]
      },
      {
        "kind": "heading",
        "title": "Saturday, 19 December 2026",
        "eyebrow": "2026 edition",
        "description": "Conference delivery, planning notes, and the work that needs attention.",
        "level": "page"
      },
      {
        "kind": "section",
        "title": "Delivery progress",
        "blocks": [
          {
            "kind": "heading",
            "title": "Tasks complete",
            "level": "section"
          },
          {
            "kind": "progress",
            "label": "Conference completion"
          }
        ]
      },
      {
        "kind": "stats",
        "labels": [
          "Blocked",
          "Unassigned",
          "Overdue",
          "Days to go"
        ],
        "columns": 4
      },
      {
        "kind": "section",
        "title": "Edition details",
        "blocks": [
          {
            "kind": "list",
            "rows": 4,
            "labels": [
              "Venue",
              "Keynote",
              "Current phase",
              "Date status"
            ],
            "compact": true
          }
        ]
      },
      {
        "kind": "toolbar",
        "actions": [
          "Manage conference tasks"
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-workspace-tasks",
    "label": "mobile conference workspace tasks",
    "route": "/organizer-console/mobile/annual-conference/2026?section=tasks",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 16,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "work-plan",
        "view": "phone"
      }
    ]
  },
  {
    "id": "mobile-conference-workspace-volunteers",
    "label": "mobile conference workspace volunteers",
    "route": "/organizer-console/mobile/annual-conference/2026?section=volunteers",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 16,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Volunteers",
        "description": "Conference team and applications",
        "level": "page"
      },
      {
        "kind": "toolbar",
        "search": "Search name, email, X or Slack",
        "actions": [
          "All",
          "Active",
          "Applicants"
        ]
      },
      {
        "kind": "section",
        "title": "Active team",
        "blocks": [
          {
            "kind": "list",
            "rows": 3,
            "secondary": "Email \u00b7 conference responsibilities",
            "actions": [
              "Details"
            ]
          }
        ]
      },
      {
        "kind": "section",
        "title": "Applications",
        "blocks": [
          {
            "kind": "list",
            "rows": 2,
            "secondary": "Email \u00b7 availability",
            "actions": [
              "Review"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-workspace-assigned",
    "label": "mobile conference workspace assigned",
    "route": "/organizer-console/mobile/annual-conference/2026",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 16,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "19 December",
        "eyebrow": "Your conference work",
        "description": "Your assigned tasks and progress, in one focused place.",
        "level": "page"
      },
      {
        "kind": "section",
        "title": "My progress",
        "blocks": [
          {
            "kind": "heading",
            "title": "Tasks complete",
            "level": "section"
          },
          {
            "kind": "progress",
            "label": "Conference completion"
          }
        ]
      },
      {
        "kind": "stats",
        "labels": [
          "Blocked",
          "In progress",
          "Overdue",
          "Completed"
        ],
        "columns": 4
      },
      {
        "kind": "toolbar",
        "actions": [
          "Open my tasks"
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-workspace-my-tasks",
    "label": "mobile conference workspace my tasks",
    "route": "/organizer-console/mobile/annual-conference/2026?section=tasks",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 16,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "work-plan",
        "view": "phone",
        "assigned": true
      }
    ]
  },
  {
    "id": "annual-conference-capacity-controls",
    "label": "annual conference capacity controls",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 24
    },
    "blocks": [
      {
        "kind": "form",
        "columns": 1,
        "fields": [
          {
            "label": "Venue capacity",
            "type": "input",
            "fullWidth": false
          }
        ],
        "actions": [
          "Save capacity"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registration-testing",
    "label": "annual conference registration testing",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 24
    },
    "blocks": [
      {
        "kind": "form",
        "columns": 1,
        "fields": [
          {
            "label": "Restrict to approved testers",
            "type": "toggle",
            "fullWidth": false
          },
          {
            "label": "Approved tester emails",
            "type": "textarea",
            "fullWidth": false
          }
        ],
        "actions": [
          "Review testing settings"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-payment-settings",
    "label": "annual conference payment settings",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/components/AnnualConferencePaymentModeSettings.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 24
    },
    "blocks": [
      {
        "kind": "form",
        "columns": 2,
        "fields": [
          {
            "label": "Testing environment",
            "type": "toggle",
            "fullWidth": false
          },
          {
            "label": "Live environment",
            "type": "toggle",
            "fullWidth": false
          },
          {
            "label": "Approved tester emails",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "actions": [
          "Review payment settings"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registration-blasts",
    "label": "annual conference registration blasts",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceRegistrationsView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 24
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Audience \u00b7 delivery status",
        "actions": [
          "View activity"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-registration-emails",
    "label": "annual conference registration emails",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/components/AnnualConferenceRegistrationEmails.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "stats",
        "labels": [
          "Accepted by provider",
          "Delivered",
          "Queued / sending",
          "Failed"
        ],
        "columns": 4
      },
      {
        "kind": "toolbar",
        "search": "Recipient email",
        "actions": [
          "Search"
        ]
      },
      {
        "kind": "toolbar",
        "filters": [
          "Delivery status"
        ]
      },
      {
        "kind": "list",
        "rows": 4,
        "secondary": "Recipient email \u00b7 message kind",
        "actions": [
          "Details"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-guest-emails",
    "label": "annual conference guest emails",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/components/AnnualConferenceRegistrationEmails.vue",
      "src/components/AnnualConferenceGuestEmails.vue"
    ],
    "capture": {
      "maxWidth": 960,
      "padding": 0,
      "context": "drawer",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 16
    },
    "blocks": [
      {
        "kind": "toolbar",
        "filters": [
          "Delivery status"
        ]
      },
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Message kind \u00b7 delivery status",
        "actions": [
          "Details"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-community-purchases",
    "label": "annual conference community purchases",
    "route": "/organizer-console/annual-conference/2026/registrations",
    "sourcePaths": [
      "src/components/AnnualConferenceCommunityTickets.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Supporter",
            "width": "28%",
            "cell": "person"
          },
          {
            "label": "Purchase",
            "width": "25%"
          },
          {
            "label": "Assignment progress",
            "width": "29%",
            "cell": "number"
          },
          {
            "label": "Actions",
            "width": "18%",
            "cell": "action"
          }
        ],
        "rows": 3,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "annual-conference-ticket-orders",
    "label": "annual conference ticket orders",
    "route": "/organizer-console/annual-conference/2026/ticketing",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue",
      "src/components/ui/BoneyardTicketOrdersFixture.vue",
      "src/styles/ticket-order-cards.css"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "ticket-orders",
        "rows": 5
      }
    ]
  },
  {
    "id": "annual-conference-ticket-delivery",
    "label": "annual conference ticket delivery",
    "route": "/organizer-console/annual-conference/2026/ticketing",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Recipient email \u00b7 latest delivery activity",
        "actions": [
          "Retry"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-sponsor-allocations",
    "label": "annual conference sponsor allocations",
    "route": "/organizer-console/annual-conference/2026/ticketing",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceTicketingView.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "table",
        "columns": [
          {
            "label": "Sponsor",
            "width": "45%"
          },
          {
            "label": "Seats",
            "width": "15%",
            "cell": "number"
          },
          {
            "label": "Contact",
            "width": "40%",
            "cell": "person"
          }
        ],
        "rows": 3,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "annual-conference-test-coupon-activity",
    "label": "annual conference test coupon activity",
    "route": "/organizer-console/annual-conference/2026/ticketing",
    "sourcePaths": [
      "src/components/Devcon26TestCoupons.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "section",
        "title": "Checkout coupon",
        "blocks": [
          {
            "kind": "heading",
            "title": "TEST CODE",
            "description": "Discount \u00b7 expiry \u00b7 eligible passes",
            "action": "Disable",
            "level": "section"
          },
          {
            "kind": "stats",
            "labels": [
              "Completed / maximum",
              "Active holds",
              "Remaining uses",
              "Needs attention"
            ],
            "columns": 4
          }
        ]
      },
      {
        "kind": "heading",
        "title": "Test checkout activity",
        "level": "section"
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Checkout",
            "width": "28%",
            "cell": "date"
          },
          {
            "label": "Pass / coupon",
            "width": "25%"
          },
          {
            "label": "Amount",
            "width": "17%",
            "cell": "number"
          },
          {
            "label": "Status",
            "width": "18%",
            "cell": "badge"
          },
          {
            "label": "Details",
            "width": "12%",
            "cell": "action"
          }
        ],
        "rows": 2,
        "mobile": "scroll"
      }
    ]
  },
  {
    "id": "annual-conference-task-resources",
    "label": "annual conference task resources",
    "route": "/organizer-console/annual-conference/2026/work-plan",
    "sourcePaths": [
      "src/components/AnnualConferenceTaskResources.vue",
      "src/components/AnnualConferenceTaskDrawer.vue"
    ],
    "capture": {
      "maxWidth": 960,
      "padding": 20,
      "context": "drawer",
      "gap": 12,
      "showHeader": false,
      "innerPadding": 4
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Resource URL \u00b7 added by organizer",
        "actions": [
          "Edit",
          "Remove"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-check-in",
    "label": "annual conference check in",
    "route": "/organizer-console/annual-conference/2026/check-in",
    "sourcePaths": [
      "src/views/admin/AdminAnnualConferenceCheckInView.vue",
      "src/components/AnnualConferenceGuests.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "page",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "toolbar",
        "actions": [
          "Checked in count",
          "Refresh",
          "Scan with camera"
        ]
      },
      {
        "kind": "toolbar",
        "search": "Name or email",
        "actions": [
          "All",
          "Not checked in",
          "Checked in"
        ]
      },
      {
        "kind": "tabs",
        "labels": [
          "All",
          "A",
          "B",
          "C",
          "D",
          "E",
          "F",
          "G",
          "H",
          "I",
          "J",
          "K",
          "L",
          "M",
          "N",
          "O",
          "P",
          "Q",
          "R",
          "S",
          "T",
          "U",
          "V",
          "W",
          "X",
          "Y",
          "Z"
        ]
      },
      {
        "kind": "list",
        "rows": 4,
        "secondary": "Attendee name \u00b7 email \u00b7 admission status",
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "annual-conference-check-in-roster",
    "label": "annual conference check in roster",
    "route": "/organizer-console/annual-conference/2026/check-in",
    "sourcePaths": [
      "src/components/AnnualConferenceGuests.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 4,
        "secondary": "Email \u00b7 admission status",
        "actions": [
          "Check in"
        ]
      }
    ]
  },
  {
    "id": "volunteer-reviews",
    "label": "volunteer reviews",
    "route": "/organizer-console/annual-conference/2026/volunteers",
    "sourcePaths": [
      "src/components/VolunteerReviewsPanel.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false
    },
    "blocks": [
      {
        "kind": "form",
        "title": "Saved email copy",
        "columns": 2,
        "fields": [
          {
            "label": "Outcome",
            "type": "select",
            "fullWidth": false
          },
          {
            "label": "Subject",
            "type": "input",
            "fullWidth": false
          },
          {
            "label": "Message",
            "type": "textarea",
            "fullWidth": true
          }
        ],
        "actions": [
          "Save message"
        ]
      },
      {
        "kind": "toolbar",
        "search": "Search applicants",
        "filters": [
          "Submission",
          "Review",
          "Decision",
          "Invitation"
        ]
      },
      {
        "kind": "table",
        "columns": [
          {
            "label": "Applicant",
            "width": "40%",
            "cell": "person"
          },
          {
            "label": "Review",
            "width": "18%",
            "cell": "badge"
          },
          {
            "label": "Invitation",
            "width": "18%",
            "cell": "badge"
          },
          {
            "label": "Submitted",
            "width": "18%",
            "cell": "date"
          },
          {
            "label": "Open",
            "width": "6%",
            "cell": "action"
          }
        ],
        "rows": 3,
        "mobile": "cards"
      }
    ]
  },
  {
    "id": "volunteer-broadcast",
    "label": "volunteer broadcast",
    "route": "/organizer-console/annual-conference/2026/volunteers",
    "sourcePaths": [
      "src/components/VolunteerBroadcastPanel.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 18.4
    },
    "blocks": [
      {
        "kind": "split",
        "ratio": "equal",
        "blocks": [
          [
            {
              "kind": "form",
              "columns": 1,
              "fields": [
                {
                  "label": "Subject",
                  "type": "input",
                  "fullWidth": false
                },
                {
                  "label": "Message",
                  "type": "textarea",
                  "fullWidth": false
                },
                {
                  "label": "Schedule (optional)",
                  "type": "input",
                  "fullWidth": false
                }
              ],
              "actions": [
                "Preview update"
              ]
            }
          ],
          [
            {
              "kind": "toolbar",
              "search": "Search accepted volunteers",
              "actions": [
                "Select all",
                "Clear"
              ]
            },
            {
              "kind": "list",
              "rows": 4,
              "secondary": "Email \u00b7 selected recipient"
            }
          ]
        ]
      },
      {
        "kind": "section",
        "title": "Broadcast activity",
        "blocks": [
          {
            "kind": "list",
            "rows": 2,
            "secondary": "Audience \u00b7 status \u00b7 sent date"
          }
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-volunteer-team",
    "label": "mobile conference volunteer team",
    "route": "/organizer-console/mobile/annual-conference/2026?section=volunteers",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 12,
      "showHeader": false,
      "innerPadding": 16
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Email \u00b7 responsibilities",
        "actions": [
          "Details"
        ]
      }
    ]
  },
  {
    "id": "mobile-conference-volunteer-applications",
    "label": "mobile conference volunteer applications",
    "route": "/organizer-console/mobile/annual-conference/2026?section=volunteers",
    "sourcePaths": [
      "src/views/admin/AdminMobileAnnualConferenceView.vue"
    ],
    "capture": {
      "maxWidth": 672,
      "padding": 16,
      "context": "phone",
      "gap": 12,
      "showHeader": false,
      "innerPadding": 16
    },
    "blocks": [
      {
        "kind": "list",
        "rows": 3,
        "secondary": "Email \u00b7 signed up",
        "actions": [
          "Review"
        ]
      }
    ]
  },
  {
    "id": "volunteer-follow-up-form",
    "label": "volunteer follow up form",
    "route": "/volunteer/follow-up/example",
    "sourcePaths": [
      "src/views/VolunteerFollowUpView.vue"
    ],
    "capture": {
      "maxWidth": 792,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "publicFormFrame": "art"
    },
    "blocks": [
      {
        "kind": "heading",
        "title": "Hi volunteer.",
        "eyebrow": "Your volunteer application",
        "description": "Please share your answers by the response deadline.",
        "level": "section"
      },
      {
        "kind": "form",
        "description": "Maximum 120 words",
        "columns": 1,
        "fields": [
          {
            "label": "Why would you like to volunteer?",
            "type": "textarea",
            "fullWidth": false
          }
        ]
      },
      {
        "kind": "form",
        "title": "Can you come to Accra and volunteer on 19 December?",
        "columns": 1,
        "fields": [
          {
            "label": "Yes, I can attend",
            "type": "toggle",
            "fullWidth": false
          },
          {
            "label": "No, I cannot attend",
            "type": "toggle",
            "fullWidth": false
          }
        ],
        "actions": [
          "Submit response"
        ]
      }
    ]
  },
  {
    "id": "system-design-learning-room-questions",
    "label": "system design learning room questions",
    "route": "/organizer-console/events/example/system-design",
    "sourcePaths": [
      "src/components/SystemDesignLearningRoomPanel.vue"
    ],
    "capture": {
      "maxWidth": 1280,
      "padding": 32,
      "context": "panel",
      "gap": 24,
      "showHeader": false,
      "innerPadding": 32
    },
    "blocks": [
      {
        "kind": "toolbar",
        "actions": [
          "Generate questions",
          "Add question",
          "Review questions",
          "Open presentation view",
          "Locks after event day"
        ]
      }
    ]
  }
];

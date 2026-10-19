import { createApp, h } from "vue";
import BoneyardPageSkeleton from "@/src/components/ui/BoneyardPageSkeleton.vue";
import "@/src/styles.css";
import "@/src/styles/forms.css";

export const BONEYARD_CAPTURE_SECTIONS = [
  ["public-events-list", "community events", "cards", false],
  ["public-dashboard", "community dashboard", "dashboard", false],
  ["speaker-talk-intake", "talk details form", "form", true],
  ["event-registration", "event registration", "form", true],
  ["archive-event-detail", "archive event", "detail", true],
  ["public-archive", "event archive", "cards", true],
  ["call-for-proposals", "proposal form", "form", true],
  ["public-feedback", "feedback form", "form", true],
  ["public-event-detail", "community event", "detail", true],
  ["system-design-participant", "learning room", "learning-room", false],
  ["admin-feedback-overview", "feedback overview", "workspace", true],
  ["admin-talks", "talk management", "table", true],
  ["admin-speakers", "speaker management", "table", true],
  ["admin-organizers", "people and access", "table", true],
  ["admin-event-detail", "event overview", "detail", true],
  ["admin-feedback", "feedback campaign", "workspace", true],
  ["admin-attendance", "attendance readout", "table", true],
  ["admin-audit-log", "audit log", "table", true],
  ["admin-attendance-overview", "attendance overview", "workspace", true],
  ["admin-events-list", "event management", "table", true],
  ["admin-event-submissions", "event submissions", "submissions", false],
  ["admin-present-forms-board-1", "present forms board", "form-board", false, 1],
  ["admin-present-forms-board-2", "present forms board", "form-board", false, 2],
  ["admin-present-forms-board-3", "present forms board", "form-board", false, 3],
  ["admin-system-design", "System Design workspace", "workspace", false],
  ["event-amendment", "event amendment", "form", false],
  ["admin-community-event-detail", "community event", "detail", false],
  ["volunteer-follow-up-campaign", "volunteer follow-up campaign", "volunteer-follow-up", false],
  ["admin-registration-workspace", "registration workspace", "registration", false],
  ["annual-conference-finance", "conference finance", "workspace", true],
  ["annual-conference-speakers", "conference speakers", "table", true],
  ["annual-conference-overview", "annual conference", "workspace", true],
  ["annual-conference-registrations", "conference registrations", "workspace", true],
  ["annual-conference-volunteers", "conference volunteers", "table", true],
  ["annual-conference-work-plan", "conference work plan", "workspace", true],
  ["annual-conference-ticketing", "conference ticketing", "workspace", true],
  ["organizer-mobile-next-actions", "your work", "mobile-actions", false],
  ["mobile-events-list", "organizer events", "mobile-events", false],
  ["mobile-event-detail", "event details", "mobile-event", false],
  ["mobile-conference-workspace", "conference workspace", "mobile-conference", false],
  ["mobile-check-in-guests", "guest list", "mobile-check-in", false],
  ["mobile-blasts-audience", "event audience", "mobile-blasts", false],
] as const;

const requestedSections = new Set(new URLSearchParams(window.location.search).getAll("section"));
const captureSections = requestedSections.size
  ? BONEYARD_CAPTURE_SECTIONS.filter(([name]) => requestedSections.has(name))
  : BONEYARD_CAPTURE_SECTIONS;

createApp({
  render() {
    return h(
      "main",
      { class: "boneyard-capture-fixtures" },
      captureSections.map(([name, label, layout, showHeader, fixtureCount]) =>
        h(BoneyardPageSkeleton, {
          key: name,
          label,
          layout,
          name,
          showHeader,
          fixtureCount,
        }),
      ),
    );
  },
}).mount("#app");

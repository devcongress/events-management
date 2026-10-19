import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const boneyardSource = readFileSync(
  new URL("./components/ui/BoneyardPageSkeleton.vue", import.meta.url),
  "utf8",
);
const overviewSource = readFileSync(
  new URL("./views/admin/AdminAnnualConferenceView.vue", import.meta.url),
  "utf8",
);
const workPlanSource = readFileSync(
  new URL(
    "./views/admin/AdminAnnualConferenceWorkPlanView.vue",
    import.meta.url,
  ),
  "utf8",
);
const volunteersSource = readFileSync(
  new URL("./views/admin/AdminVolunteerView.vue", import.meta.url),
  "utf8",
);
const speakersSource = readFileSync(
  new URL(
    "./views/admin/AdminAnnualConferenceSpeakersView.vue",
    import.meta.url,
  ),
  "utf8",
);
const financeSource = readFileSync(
  new URL(
    "./views/admin/AdminAnnualConferenceFinanceView.vue",
    import.meta.url,
  ),
  "utf8",
);

describe("Annual Conference route skeletons", () => {
  it("uses the shared accessible Boneyard boundary", () => {
    expect(boneyardSource).toContain('role="status"');
    expect(boneyardSource).toContain('animate="pulse"');
  });

  it("uses the skeleton only while each primary route query has no initial result", () => {
    expect(overviewSource).toContain(
      'v-else-if="workPlanQuery.isLoading.value" name="annual-conference-overview"',
    );
    expect(workPlanSource).toContain(
      'v-if="workPlanQuery.isLoading.value" name="annual-conference-work-plan"',
    );
    expect(volunteersSource).toMatch(
      /const volunteerRouteLoading = computed\(\s*\(\)\s*=>\s*workPlanQuery\.isLoading\.value \|\| volunteerDirectoryLoading\.value\s*,?\s*\);/u,
    );
    expect(volunteersSource).toContain(
      "v-if=\"volunteerRouteLoading && volunteerView === 'directory'\"",
    );
    expect(volunteersSource).toContain(
      'name="annual-conference-volunteers"',
    );
    expect(speakersSource).toContain(
      'v-else-if="speakersQuery.isLoading.value" name="annual-conference-speakers"',
    );
    expect(financeSource).toContain(
      'v-else-if="financeQuery.isLoading.value" name="annual-conference-finance"',
    );
    expect(volunteersSource).toMatch(
      /const canLoadVolunteerApplications = computed\(\s*\(\)\s*=>\s*canReviewApplications\.value\s*&&\s*year\.value\s*===\s*['"]2026['"]\s*,?\s*\);/u,
    );
  });
});

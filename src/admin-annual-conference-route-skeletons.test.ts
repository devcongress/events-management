import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const skeletonSource = readFileSync(
  new URL(
    "./components/ui/page-skeletons/AnnualConferenceRouteSkeleton.vue",
    import.meta.url,
  ),
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
  it("keeps route-shaped, accessible loading layouts available for every desktop sub-route", () => {
    expect(skeletonSource).toContain('aria-busy="true"');
    expect(skeletonSource).toContain(
      "'overview' | 'work-plan' | 'volunteers' | 'speakers' | 'finance'",
    );
    expect(skeletonSource).toContain("lg:grid-cols-4");
    expect(skeletonSource).toContain("'--skeleton-rows': '5'");
  });

  it("uses the skeleton only while each primary route query has no initial result", () => {
    expect(overviewSource).toContain(
      'v-else-if="workPlanQuery.isLoading.value" variant="overview"',
    );
    expect(workPlanSource).toContain(
      'v-if="workPlanQuery.isLoading.value" variant="work-plan"',
    );
    expect(volunteersSource).toMatch(
      /const volunteerRouteLoading = computed\(\s*\(\)\s*=>\s*workPlanQuery\.isLoading\.value \|\| volunteerDirectoryLoading\.value\s*,?\s*\);/u,
    );
    expect(volunteersSource).toContain(
      "v-if=\"volunteerRouteLoading && volunteerView === 'directory'\"",
    );
    expect(volunteersSource).toContain(
      '<AnnualConferenceRouteSkeleton variant="volunteers" />',
    );
    expect(speakersSource).toContain(
      'v-else-if="speakersQuery.isLoading.value" variant="speakers"',
    );
    expect(financeSource).toContain(
      'v-else-if="financeQuery.isLoading.value" variant="finance"',
    );
    expect(volunteersSource).toMatch(
      /const canLoadVolunteerApplications = computed\(\s*\(\)\s*=>\s*canReviewApplications\.value\s*&&\s*year\.value\s*===\s*['"]2026['"]\s*,?\s*\);/u,
    );
  });
});

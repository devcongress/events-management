---
name: DevCongress EMS
description: A calm operations console sharing the DevCongress website typography and navigation.
colors:
  accent: "#E8117F"
  selected: "#F5E642"
  canvas: "#F5F2E8"
  paper: "#FFFFFF"
  warm: "#FEFCE8"
  ink: "#111111"
  subtle: "#555555"
  border: "#E0DDD4"
typography:
  display:
    fontFamily: "Bricolage Grotesque Variable, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Source Sans 3 Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0px"
rounded:
  control: "6px"
  panel: "8px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  dropdown:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "50px"
  navbar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    height: "69px"
---

# EMS Design System

## Overview

The console is calm, capable, and direct, as defined in `PRODUCT.md`. Use the
cream canvas, paper panels, restrained borders, and compact operational layouts.
The public website's main branch supplies typography and navbar styling; EMS owns
its destinations and permissions. Runtime tokens live in `src/styles.css`,
`tailwind.config.ts`, and `lib/design-system.ts`. Update this document alongside
deliberate token changes. Reuse components before inventing another pattern.

## Colors

Pink identifies active navigation and focus. Yellow marks selected options and
existing primary actions. Cream separates the canvas from paper work surfaces;
warm paper provides contextual emphasis. Ink carries primary text and subtle gray
supporting text. Preserve existing semantic success, information, and error colors.

## Typography

Use self-hosted Source Sans 3 for body text, forms, navigation, and labels, and
Bricolage Grotesque with optical sizing for headings. Preserve mixed-case navbar
labels. Semantic code uses the separate IBM Plex Mono code token; ordinary UI
text must not inherit a monospace face. On phones, native editable fields remain
at least 16px to avoid focus zoom. Long labels must not widen the page.

## Elevation

Panels primarily use borders and surface contrast. Dropdowns use the existing
soft floating shadow. Preserve shared stacking tokens: the application header sits
above event tabs and below application dialogs. Sticky regions reuse the measured
header offset, including the safe-area inset.

## Components

**Application navigation:** At widths above 960px, keep the horizontal navbar and
place destinations that do not fit in an anchored More disclosure. Measure the
permission-filtered labels after fonts settle; retain their order and highlight
More when it contains the current section. Reserve the full-width menu for
viewports at or below 960px. Preserve keyboard focus when resizing moves a link.
Sign Out uses a rectangular outline with 2px corners and a warm-yellow hover
background without positional movement. Keep its 44px target and focus outline.

**Forms:** Use `AppDropdown.vue` for single choice and `AppMultiSelectDropdown.vue`
for multiple choice, including loading fixtures. Native select menus are
prohibited. Default fields are 50px high; compact and slim variants support dense
toolbars. Coarse-pointer dropdown triggers and options are at least 44px high.
Use teleported menus inside clipped containers. Preserve shared keyboard
navigation, labels, focus return, disabled behavior, and viewport positioning.

**Sibling navigation:** Use `WorkspaceSectionNav.vue`, as in Ticketing and
Registration. Store selection in URL query state so direct links and browser Back
restore it. Preserve the workspace across query changes so drafts survive; close
inactive overlays without clearing forms. On phones the row scrolls horizontally,
reveals the active item, and shows an overflow cue. Links are at least 44px wide
and 46px high.

**Underline rows:** Reuse `src/styles/underline-section-nav.css` for workspace,
Annual Conference, event Registration, and Audit Log underline navigation. Align
labels near the divider with 5px bottom padding and a single 2px pink active
indicator on that divider. Keep the full 46px target above the label; do not add
another active border or turn segmented controls into underline tabs.

**Parents:** Use `OrganizerBreadcrumbs.vue`. Resolve labels from cached records
without extra reads; use neutral fallbacks while names load. Only the current
leaf has current-page semantics. Phone trails show the nearest parent and current
workspace, returning to the same conference year. Breadcrumbs complement the
sibling row.

**Phones:** Keep Ticketing on its existing responsive route. Its Mobile Conference
entry follows existing role/capability rules. Orders use cards below the desktop
table breakpoint. Forms stack, drawer Close controls remain visible, safe areas
are respected, and scrolling stays in the intended region.

**Loading:** Resolve by the stable section ID in `src/boneyard/sections/`. Match
the loaded layout, role, tab, and container. Reuse loaded presentation components
or styles for complex shapes. Synthetic fixtures remain inert. Page previews fit
available viewport space; loaded content stays visible on background refresh.
Nested panels below the fold use an explicit capped preview when needed so their
skeleton content remains visible when scrolled to; zero overflow alone is not a
successful loading state.
Capture list cards and table cells through their children so labels, values, and
actions remain distinct. Verify visible field bones rather than accepting a
single solid block with the correct outer dimensions.
Completed captures require an explicit refresh to replace them.

**Motion:** Follow `AGENTS.md`: use opacity and transform only when useful, exact
transition properties, and reduced-motion support. Query section changes must not
trigger full-page route entrances.

## Do's and Don'ts

- Do reuse shared tokens and controls and verify both phone and desktop layouts.
- Do preserve visible keyboard focus, meaningful parent links, and readable labels.
- Don't use generic SaaS dashboard tropes with oversized KPI tiles, decorative
  gradients, and fake “insight” language.
- Don't make cluttered admin tools that force organizers to scan dense tables
  before they understand the next step.
- Don't add fancy overlay-heavy UI that hides the core record or makes response
  review feel theatrical instead of useful.
- Don't introduce marketing-style surfaces inside the organizer console.
- Don't replace a source-specific loading layout with generic placeholder lines.

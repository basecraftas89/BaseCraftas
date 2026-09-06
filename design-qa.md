# Craft Growth V3 Design QA

## Findings

No actionable P0, P1, or P2 findings remain.

The page is reduced from eight sections to five. The three-, six-, and twelve-month descriptions now share one tabbed display area, reducing vertical repetition while keeping each period's material available.

## Source visual truth

- Design-direction reference: `https://is.makonari.com/`
- Existing Base Craftas service-page system: `services/visit.html`, `services/vital.html`, `css/style.css`
- Content source: `SERVICE_PAGE_CONTENT_SPEC.md`
- Growth presentation assets: `images/08_custom/growth-*.jpg`
- Reference capture: `/tmp/growth-reference-makonari.png`

## Implementation evidence

- Desktop hero: `/tmp/growth-v3-hero.png`
- Large overview material: `/tmp/growth-v3-overview.png`
- Desktop six-month tab: `/tmp/growth-v3-tabs-6m.png`
- Mobile hero: `/tmp/growth-v3-mobile-hero.png`
- Mobile tab layout: `/tmp/growth-v3-mobile-tabs.png`
- Reference and implementation comparison: `/tmp/growth-v3-comparison.png`
- Desktop viewport: 1440 x 1000 CSS px, device pixel ratio 1
- Mobile viewport: 390 x 844 CSS px

## Full-view comparison

- The reference and implementation both use one dominant proposition, one primary visual, concise proof points, and a clear first action.
- The Base Craftas dark-green overlay and terracotta CTA remain consistent with the other service pages.
- The implementation intentionally prioritizes service explanation over the reference site's consumer-subscription presentation.

## Focused-region comparison

### Hero

- Desktop and mobile retain the intended four-line headline.
- Photograph crop, overlay contrast, navigation, and CTA hierarchy remain stable after the section reduction.

### Main overview material

- `growth-overview.jpg` is displayed at 1160 CSS px wide on desktop.
- The material is visible directly in the page and can also be enlarged in a native dialog.

### Period tabs

- Only one of `panel-3m`, `panel-6m`, and `panel-12m` is visible at a time.
- Each period changes the purpose statement, outputs, material image, selected styling, and accessible state.
- The three tabs remain in one horizontal row at 390 px to avoid adding unnecessary page height.

## Required fidelity surfaces

- Fonts and typography: existing Noto Sans JP and Montserrat system retained; desktop and mobile wrapping verified.
- Spacing and layout rhythm: five sections; repeated three-, six-, and twelve-month sections replaced by one shared panel.
- Colors and visual tokens: existing Base Craftas green, mist, cream, terracotta, and border tokens retained.
- Image quality and asset fidelity: source presentation images are used directly and load at their original raster dimensions.
- Copy and content: the overview headline, period labels, outputs, estimate guidance, FAQ, and CTA remain consistent with the specification.

## Interaction verification

- Clicking the three-, six-, and twelve-month buttons selects the correct panel.
- Six-month panel shows `growth-6month-seminar-recruitment.jpg`.
- Twelve-month panel shows `growth-12month-expansion.jpg`.
- Left and right arrow keys change the selected tab.
- Mobile navigation opens and reports `aria-expanded=true`.
- Material lightbox opens with a 1536 px source image and closes correctly.
- Sticky mobile CTA is hidden at the top and appears after scrolling.
- Browser console errors: none.

## Comparison history

1. V2 used separate long sections for three, six, and twelve months and produced an approximately 8492 px desktop full-page capture.
2. V3 merged the three periods into a single accessible tab component and reduced the page to five sections.
3. The main overview material was promoted to a full-width 1160 px presentation surface.
4. The mobile tabs were initially considered as stacked controls, then kept in one compact horizontal row to reduce page length.

## Follow-up polish

- A verified case-study section can be added later without changing the tab structure when publishable evidence becomes available.

final result: passed

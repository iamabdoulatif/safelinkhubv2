# General settings redesign implementation plan

Goal: apply the approved guided visual language to the general settings hub.
Architecture: server page retains scoped data loading; a pure overview component renders organization identity, truthful statuses, next action and three grouped settings sections. Hide redundant tabs only on the general route.

- [x] Test the empty, configured and unavailable counter states, preserved links and reseller identity.
- [x] Build the responsive overview and integrate unchanged scoped queries, preserving unavailable states.
- [x] Verify desktop/mobile rendering, navigation and copy control without changing customer settings.
- [ ] Run checks, review, commit, deploy and verify production health.

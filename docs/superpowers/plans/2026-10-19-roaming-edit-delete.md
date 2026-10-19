# Roaming guided management implementation plan

Goal: implement the approved guided design with editable/deletable groups, profiles, offers and accounts.
Architecture: retain existing provisioning and account flows; add organization-scoped management actions and reusable native-dialog editor. Replace the navigation with three guided steps and group/profile cards.
Stack: Next.js server actions, React, Drizzle/PostgreSQL, existing SafeLinkHub theme.

- [x] Test management validation and dependency guards; add scoped server actions for group/profile/offer edits and unused-profile deletion.
- [x] Add reusable accessible edit/delete dialogs with prefilled fields, explicit consequences and server feedback.
- [x] Apply the selected guided layout: Zones → Forfaits → Comptes, keeping account/device controls and group coverage reachable.
- [x] Verify deletion of bindings; preserve account records on incomplete revocation.
- [ ] Verify typecheck, lint, tests and responsive UI using demonstration data; independent review; commit and deploy; check production health.

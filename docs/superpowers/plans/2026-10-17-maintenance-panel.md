# Maintenance panel implementation plan

**Goal:** Replace the router maintenance dropdown with a responsive side panel following the existing admin palette.

**Architecture:** Keep server actions and existing credential/destructive dialogs in HeaderActions. Use a native modal dialog within the admin theme, grouped actions with expandable explanations and explicit execution buttons, pending and result feedback.

- [x] Replace anchored portal menu with a native dialog; retain keyboard focus, Escape, backdrop close and scroll locking.
- [x] Group Network, Captive portal, MikHmon, and advanced reinstallation; use only existing theme tokens.
- [x] Preserve action handlers, credentials and destructive confirmation; show progress and failures.
- [x] Verify TypeScript, lint and browser behavior without executing router maintenance.

Validation: TypeScript and scoped ESLint pass; 9 portal tests pass. Isolated browser preview uses the real component and compiled theme, with server actions stubbed: 440px desktop panel, 390px mobile without overflow, preserved lime #D6F344, expandable details, result feedback, Escape/focus return, and reinstallation confirmation. No real router operations executed.

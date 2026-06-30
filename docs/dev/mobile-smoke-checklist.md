# Mobile Smoke Checklist

Playwright covers mobile via device **emulation** (Pixel 5, iPhone 13, iPad portrait/landscape — see `e2e/playwright.config.ts`). Emulation catches layout regressions but not real touch behavior, real keyboards, real Safari/Chrome quirks, or real network. This checklist is the **manual gate** for those: run it on a real device before shipping any change that touches mobile layout, the composer, the sidebar, or streaming.

This mirrors geode's mobile gate (`docs/testing/06_step_gates.md`, Gate 8): some surfaces a headless emulator cannot reach, so a human drives a real device.

## When to run

- Any change to responsive layout, breakpoints, or the mobile sidebar.
- Any change to the chat composer, attachments, or send flow.
- Any change to live streaming / SSE rendering.
- Before a release.

Skip for backend-only, docs, or desktop-only changes.

## Device matrix

Run the checklist on **at least one iOS and one Android device**. Record the device/OS/browser you used in the PR.

| Class | Device (example) | OS | Browser |
|-------|------------------|----|---------|
| Phone (iOS) | iPhone (any current) | iOS 17+ | Safari |
| Phone (Android) | Pixel / Samsung Galaxy | Android 14+ | Chrome |
| Tablet (optional) | iPad | iPadOS 17+ | Safari |

Emulation baseline (automated, not a substitute): Pixel 5, iPhone 13, iPad portrait + landscape via Playwright.

## Checklist

Serve a test build on a LAN-reachable port (`PI_WEB_TOKEN="" pi-web.exe -p <port> -host 0.0.0.0`) and open it from the device's browser. Never point a device at the prod server on `31415`.

- [ ] **Index loads.** Session list renders; project groups and labels are readable without horizontal scroll.
- [ ] **Open a session.** Tap a session → it opens; the back/close affordance returns to the index.
- [ ] **Sidebar toggle.** Open and close the mobile sidebar; it overlays correctly and dismisses on outside tap / navigation.
- [ ] **Composer — keyboard.** Tap the composer; the on-screen keyboard appears and does NOT obscure the input or the send button. The view scrolls to keep the caret visible.
- [ ] **Send a message.** Type and send; the message appears and the composer clears.
- [ ] **Live streaming.** A streaming reply renders incrementally (live preview), then settles into the final structured entry. No flicker, no duplicated text, thinking blocks collapse correctly.
- [ ] **Long scroll + load earlier.** In a long session, scroll up; "load earlier" pulls older entries without jumping the scroll position.
- [ ] **New session.** Start a new session from mobile; first message streams and the session is titled.
- [ ] **Orientation.** Rotate portrait → landscape → portrait; layout reflows without clipping or stuck overlays.
- [ ] **Share / export view.** Open a shared/export session URL on mobile; it renders read-only with no live chrome (no composer, no SSE).
- [ ] **Background / foreground.** Background the browser for ~30s, return; the session reconnects (SSE resumes) and is up to date.

A change is mobile-verified only when every applicable item passes on at least one real iOS and one real Android device.

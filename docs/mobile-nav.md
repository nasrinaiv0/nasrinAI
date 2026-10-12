# Phone and tablet navigation

Owner request (2026-10-12): a top bar with a menu button on phones and
tablets; the bottom tab bar is an option.

- On phones and tablets the header shows only the **menu button** and **New
  chat** (icon); Your chats and Settings moved into the menu.
- **Menu button** (two lines, top left of the header, under 70rem) opens a
  drawer from the left: NasrinAI and a search button (opens Your chats),
  Library, Projects, Your chats, up to 8 recent chats with "See all…", and at
  the bottom **New chat** and **Settings**. Tap outside or press Escape to
  close. Library and Projects show only when the server offers them; signed
  out, they ask to sign in (the existing screens).
- **Bottom tab bar** (Chat, Library, Projects, Settings): off by default; turn
  it on in Settings > General > Layout. Kept on this device only
  (`nasrin.tabbar`), applied before the page draws (`theme.js`). It hides while
  typing on touch screens and comes back 300 ms after, so a tap on Send lands.
- Desktop (70rem and wider) keeps the side rail; no menu button or bar.

Test: `test/mobile-nav.test.js`. Checked in headless Chromium at 320, 390, 768
and 1280 px.

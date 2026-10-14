# Voice screen

The full-screen voice conversation (`#voice` in `public/index.html`). Owner
request, 2026-10-12: minimalist, monochrome, with outstanding buttons and icons.

## Layout

- **Conversation at the top.** What you said (right, softer) and what Nasrin
  said (left) appear in a band at the top of the screen. The newest lines sit
  nearest the orb; older lines fade out toward the top edge (a CSS mask).
- **The orb, lower centre.** A glowing liquid drop drawn in SVG by
  `public/voice-wave.js` (`createOrb`). It wobbles like liquid with the voice
  and sends out rings, its sound waves: more, faster and brighter the louder
  the voice. While listening it follows your microphone level (from the stream
  the app already opened, never a second microphone); while speaking it follows
  Nasrin's voice. Thinking is a slow, tight wobble; paused (muted) is calm and
  dim. Black in Light mode, white in Dark mode.
- **Tap the orb to stop Nasrin** while she talks or thinks (it is the
  `#voiceSkip` button; it is disabled otherwise).
- **Controls**, one row at the bottom, all at least 44 pt:
  - left: **Plus** (photos and files; Create image when available) and the
    **tier** (Quick, Pro, Max, Ultra; locked tiers say why);
  - right: **mute / unmute** the microphone and **Exit** (back to the chat).
- The speed button and the second close button were removed. Reading speed
  now follows the server setting (`speech.rate` from `/v1/status`); an old
  per-device speed choice is cleared.

## Fixes in the same change

- **Realtime transcripts:** both realtime paths (OpenAI and Gemini) looked for
  `.voice-line` elements, a class no line has. Every streamed word became its
  own line and stayed styled as "live". They now find `.vmsg` lines, and a
  finished reply loses its live styling.
- **Settings > Voice:** the voice screen's CSS used `.voice`, which is also the
  class of each row in Settings > Voice, so every row became a fixed
  full-screen layer and only one voice was visible. The voice screen now uses
  `.voice-screen`, and all its styles live in `public/voice-liquid-glass.css`.
- "Realtime voice is on" appears only once realtime has really started; before,
  it also showed when the app fell back to compatibility mode.

## Less motion

With reduced motion (device setting or Settings > General), the orb is drawn
once, calm and without rings, and the screen does not animate in.

## Tests

`test/voice-screen.test.js`. Checked in headless Chromium at 320, 390 and 1280
px, light and dark: no sideways scroll, controls 44 px or larger, tier and Plus
menus open and close (also by tapping outside), mute toggles its label, Exit
returns to the chat, and Settings > Voice lists every voice.

## iPhone: realtime voice sound (2026-10-14)

Gemini realtime replies showed "Talking…" with no sound on iPhone. Two causes:
- The reply was played straight through Web Audio, which iOS sends to the quiet
  earpiece (or mutes) while the microphone is on. It now plays through the
  `<audio>` element created during the Start tap (`hooks.audioElement` →
  `createMediaStreamDestination`), the same way the OpenAI voice plays.
- Every tap set `navigator.audioSession.type = 'playback'` (for read-aloud),
  also during a call. Taps during a call no longer change it, and starting a
  call sets it back to `'auto'`.
The audio context is also resumed from iOS's `interrupted` state, not only
`suspended`. Needs a real iPhone call to confirm.

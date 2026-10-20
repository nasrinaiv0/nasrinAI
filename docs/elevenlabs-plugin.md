# ElevenLabs Developer Plugin â€” Video Studio Integration

Status: Phases 1â€“3 are implemented on the feature branch and integrated into the existing `public/video-studio.html` workspace: server-side voice discovery, persistent audio assets, owner-scoped timeline CRUD, and FFmpeg MP4 audio mixing/export. The studio subdomain redirects to `https://nasrinai.com/video-studio.html` to preserve the existing HttpOnly session cookie. Full CI, production storage/migration, and deployed FFmpeg smoke tests remain required before release.

## Product intent

ElevenLabs is a **user-facing developer plugin for NasrinAI Video Studio**. It lets users use supported ElevenLabs audio-generation and audio-processing features inside their video creation workflow. It is not a general NasrinAI chat/realtime voice provider, and must not replace or alter existing OpenAI/Gemini speech or realtime voice paths.

Official docs:
- API capabilities: https://elevenlabs.io/api
- Text-to-speech: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- Sound effects: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects
- General documentation: https://elevenlabs.io/docs/overview/intro

## Video Studio capabilities

Implement these as distinct, clearly labeled actions. Every action must be enabled only when its server-side capability is configured and tested.

1. **Voiceover / narration**: convert a user's video script or selected scene narration to speech, choose a permitted voice/m¶»§q«^
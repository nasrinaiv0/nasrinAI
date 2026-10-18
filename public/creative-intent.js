// Shared creative-intent detection and universal slash-command registry.
(() => {
  'use strict';

  const COMMANDS = Object.freeze({
    clone: { capability: 'image', executeFirst: true, requiresPhoto: true },
    blur: { capability: 'image', executeFirst: true, requiresPhoto: true },
    'remove-background': { capability: 'image', executeFirst: true, requiresPhoto: true },
    upscale: { capability: 'image', executeFirst: true, requiresPhoto: true },
    image: { capability: 'image', executeFirst: true, requiresPhoto: false },
    video: { capability: 'video', executeFirst: true, requiresPhoto: false },
    rewrite: { capability: 'chat', executeFirst: true },
    translate: { capability: 'chat', executeFirst: true },
    summarize: { capability: 'chat', executeFirst: true },
    shorten: { capability: 'chat', executeFirst: true },
    expand: { capability: 'chat', executeFirst: true },
    proofread: { capability: 'chat', executeFirst: true },
    explain: { capability: 'chat', executeFirst: true },
    debug: { capability: 'chat', executeFirst: true },
    review: { capability: 'chat', executeFirst: true },
    research: { capability: 'chat', executeFirst: true },
    compare: { capability: 'chat', executeFirst: true },
    plan: { capability: 'chat', executeFirst: true },
    brainstorm: { capability: 'chat', executeFirst: true },
    email: { capability: 'chat', executeFirst: true },
    code: { capability: 'chat', executeFirst: true },
    analyze: { capability: 'chat', executeFirst: true },
    automate: { capability: 'chat', executeFirst: true },
    search: { capability: 'chat', executeFirst: true },
    browse: { capability: 'chat', executeFirst: true },
    remember: { capability: 'chat', executeFirst: true },
    recall: { capability: 'chat', executeFirst: true },
    library: { capability: 'chat', executeFirst: true },
    file: { capability: 'chat', executeFirst: true },
    document: { capability: 'chat', executeFirst: true },
    connect: { capability: 'chat', executeFirst: true }
  });

  const informational = /^(how|what|why|when|where|who|can you explain|tell me about|define)\b/i;
  const action = /\b(create|generate|make|design|draw|render|produce|animate|build|turn|need|want)\b/i;
  const imageTarget = /\b(image|images|picture|pictures|photo|photos|photograph|photographs|portrait|poster|thumbnail|logo|illustration|artwork|graphic|visual|banner|cover|wallpaper|icon)\b/i;
  const videoTarget = /\b(video|videos|clip|clips|short film|reel|reels|ad|ads|advertisement|commercial|promo|promotional video|video ad)\b/i;
  const imageEnhancement = /\b(enhance|enhancement|upscale|upscaling|sharpen|sharpening|deblur|denoise|restore|restoration|improve (?:the )?(?:image|photo|picture|quality)|higher resolution|high resolution|hd|4k|8k|make it clear(?:er)?|make this clear(?:er)?|less blurry|remove blur|fix blur)\b/i;

  function parseShortcut(text) {
    const match = String(text || '').trim().match(/^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i);
    if (!match) return null;
    const name = match[1].toLowerCase();
    const command = COMMANDS[name];
    if (!command) return null;
    return Object.freeze({ name, args: (match[2] || '').trim(), ...command });
  }

  function detect(text) {
    const s = String(text || '').trim().toLowerCase();
    if (!s) return null;
    const shortcut = parseShortcut(s);
    if (shortcut) return shortcut.capability === 'image' || shortcut.capability === 'video' ? shortcut.capability : null;
    if (informational.test(s)) return null;

    // Enhancement requests often omit the word image/photo (e.g. “make it clear and HD”).
    // Route them to the existing image-edit endpoint rather than ordinary chat.
    if (imageEnhancement.test(s) && /\b(make|improve|enhance|upscale|sharpen|deblur|denoise|restore|convert|fix|please|turn)\b/.test(s)) return 'image';
    if (/\b(turn|animate|convert|make)\b[\s\S]*\b(into|as)\b[\s\S]*\b(video|clip|reel)\b/.test(s)) return 'video';
    if (imageTarget.test(s) && /\b(video thumbnail|thumbnail|poster|cover|banner|logo|icon|wallpaper|photo|photograph|picture|image)\b/.test(s)
        && action.test(s)) return 'image';

    const hasAction = action.test(s) || /\b(i'd like|i would like|can you|could you|please)\b/.test(s);
    if (!hasAction) return null;
    if (videoTarget.test(s)) return 'video';
    if (imageTarget.test(s)) return 'image';
    return null;
  }

  globalThis.NasrinCreativeIntent = Object.freeze({ detect, parseShortcut, commands: COMMANDS });
})();

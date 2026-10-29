// Curated official programming references for NasrinAI's continuous-learning crawler.
// Keep these as documentation roots, not arbitrary user-controlled URLs.
// The crawler still enforces public-URL/SSRF checks, robots.txt, deduplication,
// bounded batches, and the existing CRON_SECRET-protected internal route.
export const PROGRAMMING_DOC_SOURCES = Object.freeze([
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  'https://www.typescriptlang.org/docs/',
  'https://docs.python.org/3/',
  'https://www.postgresql.org/docs/',
  'https://developer.mozilla.org/en-US/docs/Web/HTML',
  'https://developer.mozilla.org/en-US/docs/Web/CSS',
  'https://react.dev/learn',
  'https://nextjs.org/docs',
  'https://nodejs.org/docs/latest/api/',
  'https://go.dev/doc/',
  'https://doc.rust-lang.org/book/',
  'https://docs.oracle.com/en/java/',
  'https://learn.microsoft.com/en-us/dotnet/csharp/',
  'https://isocpp.org/get-started',
  'https://www.swift.org/documentation/',
  'https://kotlinlang.org/docs/home.html',
  'https://www.gnu.org/software/bash/manual/',
  'https://learn.microsoft.com/en-us/powershell/',
  'https://docs.soliditylang.org/'
]);

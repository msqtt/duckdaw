# Changelog

All notable DuckDAW changes are documented here.

## [0.3.0-rc.1] - Unreleased

### Added
- Tempo Map with step/linear segments, exact beat/seconds conversion, and realtime/offline scheduling.
- Track automation for volume, pan, reverb, delay, and master volume.
- Version 2.0 project routing with Bus/Group outputs, pre/post Sends, effect descriptors, DAG validation, and v1.x migration to a Master Bus.
- Export effect tail, dynamic-tempo regions, peak normalization, configurable -1 dBFS limiter default, WAV stems ZIP, and shared realtime/offline mix planning.
- GitHub Contents baseline SHA persistence, conflict copy/reload/force/cancel transactions, recovery-before-replace, and frozen-SHA force confirmation.
- Playwright Chromium/Firefox/WebKit workflows for save/reload, undo, Audio reverse, MIDI transpose, recovery, unsupported APIs, SPA fallback, deployment identity, and serious/critical axe checks.
- Netlify staging context and SPA/cache headers, CI quality/browser gates, staging smoke workflow, and manually verified release workflow.

### Changed
- Project package format is now `2.0.0`; v1.x projects migrate atomically to Tempo Track, Automation defaults, and a unique Master Bus.
- Candidate package version is `0.3.0-rc.1`; all npm dependencies and security overrides are exact versions.
- Removed unused GenAI, Express, dotenv, autoprefixer, tsx, and direct esbuild dependencies; removed the unused GEMINI build-time define.

### Security
- Dependency audit is required in CI. The candidate dependency tree has no known npm audit findings at the time of review.
- GitHub tokens remain session-scoped and are never written to project packages or persistent baseline storage.

### Known platform boundaries
- File System Access API is optional; unsupported browsers use `.duckdaw` downloads and file inputs.
- Web MIDI and microphone recording remain permission/browser dependent and expose visible unsupported states.
- MP3/OGG export uses the self-hosted FFmpeg WASM asset and can require substantial memory; stems are rendered sequentially as WAV files.

[0.3.0-rc.1]: https://github.com/msqtt/duckdaw/compare/v0.2.0...v0.3.0-rc.1

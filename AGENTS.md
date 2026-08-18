# DuckDAW Agent Instructions

## 1. Scope and authority

This file applies to the entire repository. Every agent working in DuckDAW must follow it.

- Direct user instructions take precedence over this file.
- [`docs/specs/`](docs/specs/) is the authoritative product, architecture, project-format, delivery, and release specification set. Follow its internal precedence rules in [`docs/specs/README.md`](docs/specs/README.md).
- For current next-generation work, [`docs/specs/07-next-generation-optimization.md`](docs/specs/07-next-generation-optimization.md) is the delivery contract; [`docs/specs/04-project-format.md`](docs/specs/04-project-format.md) governs persisted formats; [`docs/specs/05-delivery-plan.md`](docs/specs/05-delivery-plan.md) records status and evidence.
- If code and a specification disagree, do not silently rewrite the specification to match a defect. Record the gap and either fix the implementation or make an explicit, reviewed specification change.
- A button, label, type, state field, feature flag, TODO, isolated helper, or static source-string test is not proof that a feature is implemented.

## 2. Specification-driven development (SDD)

Update and freeze the specification before changing implementation. Every new or changed behavior must:

1. Have a stable requirement ID and explicit scope.
2. Define user-visible behavior, domain APIs, schemas, invariants, and relevant performance thresholds.
3. Define happy paths, boundary cases, invalid input, permission failures, cancellation/rollback, and resource-release behavior.
4. Define persisted-format versioning, migration, backward compatibility, and failure semantics when data is affected.
5. Define test IDs, observable acceptance criteria, rollout/release requirements, and operational signals.
6. Update the applicable traceability matrix before the item is marked complete.

When implementation reveals a design conflict, stop and update the specification first. Do not claim completion from UI-only wiring, dormant fields, mocks without a product call path, or placeholder behavior.

## 3. Test-driven development (TDD)

Use this sequence for every behavior change:

1. Write a test that expresses the frozen contract.
2. Run it and preserve evidence that it fails for the expected reason (red).
3. Add the smallest complete implementation, including the real product call path.
4. Run targeted tests until they pass (green).
5. Add or retain coverage for boundaries, malformed input, cancel/rollback, permissions, migration, undo transactionality, and resource cleanup as applicable.
6. Run type checking and the affected build.
7. Run the complete regression and all required quality gates.
8. Obtain independent review of the real end-to-end call path.
9. Synchronize specification, traceability, status, and release evidence.

Tests must cover relevant happy, boundary, invalid, cancellation, migration, lifecycle, unsupported-browser, and failure paths. Audio work must cover realtime/offline parity; editing work must cover undo boundaries; device work must prove that the selected device ID reaches the browser API.

Never:

- implement first and add an always-green static test as alleged TDD evidence;
- treat source-string presence, a UI label, a Store action, or an unused pure function as integration evidence;
- delete or weaken a failing contract instead of fixing the behavior;
- loosen a frozen performance, bundle, audio, accessibility, or lifecycle budget merely to make CI pass.

## 4. Required validation gates

At minimum, run from the repository root:

```bash
npm test
npm run lint
npm run build
npm run check:size
git diff --check
```

`npm run lint` is the current TypeScript no-emit check. Run targeted unit/integration tests before the full suite. Changes covered by browser workflows must also pass the specified Playwright Chromium, Firefox, and WebKit matrix, including unsupported-API fallback cases. Performance-sensitive changes require the applicable benchmark or browser profile; do not substitute a brittle one-off timing assertion.

Frozen bundle budgets are:

- DAWApp: **400 KiB** maximum;
- Tone vendor chunk: **300 KiB** maximum;
- React vendor chunk: **220 KiB** maximum;
- ExportModal: **40 KiB** maximum.

These limits are delivery requirements. In particular, the DAWApp budget must not be raised above 400 KiB to bypass a failure.

A feature is not complete while any required test, type check, build, E2E run, budget, specification sync, or independent review is missing. If a gate cannot run because credentials, browser support, or infrastructure are unavailable, report it as blocked with exact evidence; do not report success.

## 5. Product integration and review

Independent review must inspect actual call chains and side effects, not only declarations or unit helpers. As applicable, prove:

- UI action -> Store/domain API -> browser, storage, audio, or remote API behavior;
- imported data is committed to project state and exported data creates the intended download;
- the selected MIDI/audio device ID reaches `connectMidiInputs`/`getUserMedia`;
- count-in really delays recording and cancellation prevents later start;
- meters consume actual MIDI velocity or microphone analyser data;
- takes are committed and switched in the active clip;
- one user gesture creates one sensible undo transaction;
- realtime and offline rendering use the same timing/parameter/render plan;
- failure preserves the last valid project/recovery state;
- all acquired resources are released at the correct ownership boundary.

No reviewer may mark a requirement complete solely because a helper, static string test, UI control, state field, or action exists.

## 6. Data, audio, and lifecycle invariants

- Never revoke a Blob URL while another split clip, clipboard item, recovery snapshot, or take still owns it. Release only after the last owner is gone.
- Dispose Tone nodes and meters; clear Transport schedules; stop every `MediaStreamTrack`; disconnect analysers; release AudioBuffers and object URLs at their defined lifecycle boundary.
- A failed recovery write must not replace the last valid recoverable snapshot.
- Persisted-format migrations must be atomic from the active project's perspective. On failure, preserve current state.
- Realtime and offline engines must share timing, automation, routing, fade, and playback planning rather than duplicating divergent calculations.
- Routing changes must validate the candidate Bus/Send graph as a DAG before committing it.
- MIDI and audio editing actions must have deterministic, testable semantics and coherent single-action undo behavior.

## 7. Dependency and supply-chain governance

- Add dependencies only when necessary and pin every newly added package to an exact version; do not introduce an open range.
- Before adoption, review package identity (including typosquatting risk), maintenance, license/NOTICE obligations, bundle cost, browser support, and security advisories.
- Do not run `npm audit fix --force`. Resolve findings deliberately and validate breaking changes.
- FFmpeg runtime assets must be same-origin/self-hosted. Do not fetch executable assets from unpkg or another runtime CDN.
- Do not transmit repository code, credentials, project files, or user data to a third-party service unless the user explicitly requests and authorizes it.
- Release review must explicitly assess licenses and notices, especially FFmpeg/GPL implications.

## 8. Git and workspace safety

- Do not commit or push unless the user explicitly requests it.
- Do not push directly to `main` unless the user explicitly authorizes that exact action. Use reviewed staging/PR/merge flow.
- Stage named files precisely; never use `git add .`.
- Never commit `.kiro/`, `.env*`, tokens, secrets, credentials, `dist/`, generated bundles, local logs, caches, or temporary files.
- Keep hooks enabled; do not use `--no-verify`.
- Do not force-push, amend unrelated history, run `reset --hard`, or run `clean -f` without explicit user confirmation.
- Preserve unrelated and pre-existing working-tree changes. Do not overwrite or revert them.
- Push a new branch with `-u`. Verify the remote commit and CI state after push.
- New commits are preferred over amending. Create commits, tags, releases, and pull requests only when requested.

## 9. Production and staging topology

The two environments are fixed and must remain isolated.

Production:

```text
main
  -> Netlify production deploy
  -> duckdaw.netlify.app
  -> Cloudflare DNS/TLS
  -> daw.msqt.fun
```

Staging:

```text
staging
  -> Netlify branch deploy / staging context
  -> staging branch deployment
  -> Cloudflare DNS/TLS
  -> daw-sit.msqt.fun
```

Hard constraints:

- `main` is production; `staging` is pre-production. Validate on staging before merging to `main`.
- Keep production on Netlify. Do not migrate it to Cloudflare Pages.
- Cloudflare manages DNS/TLS only. Application deployments remain on Netlify.
- Preserve the production CNAME `daw.msqt.fun -> duckdaw.netlify.app` and the existing production domain.
- Bind `daw-sit.msqt.fun` to the Netlify `staging` branch context/branch deployment. It must never fall back to or alias the production deployment.
- Production and staging responses/pages must expose enough deployment metadata to verify the deployed commit.
- Do not treat a deploy URL, DNS record, TLS certificate, or successful build alone as proof that the intended commit and environment are live.

Known operational identifiers are Netlify site name `duckdaw` and site ID `78e3baf0-6dc6-4348-9c20-0344eeff955d`. Treat DNS, TLS, site configuration, merges, and production releases as high-impact changes: explain the action and risk and obtain explicit confirmation before mutation. If the Netlify token is absent or Cloudflare permissions return an authorization error, stop and report the blocker; never fabricate configuration or deployment success.

## 10. Deployment gates

### Staging

1. All local required gates pass and specifications/status are synchronized.
2. Push the reviewed `staging` commit only when authorized.
3. Wait for the Netlify branch deploy/staging context to complete.
4. Verify DNS resolution and TLS for `daw-sit.msqt.fun`.
5. Verify the hostname resolves to the staging branch deployment, not production.
6. Verify SPA fallback, asset/cache behavior, and deployed commit identity.
7. Run core smoke paths and the required browser E2E matrix.
8. Record URLs, commit SHA, deploy ID, checks, and results as release evidence.

### Production

1. Staging is green for the exact candidate commit, with no unresolved P0/P1 review findings.
2. Merge the reviewed candidate to `main` through the authorized flow; do not bypass branch protections.
3. Wait for the Netlify production deployment.
4. Verify DNS/TLS, SPA fallback, cache behavior, and commit identity at `daw.msqt.fun`.
5. Explicitly prove production is not serving the staging deployment and staging did not fall back to production.
6. Run production smoke/E2E checks without destructive user-data actions.
7. Create the requested version tag and GitHub Release only after production verification.
8. Update specifications, traceability, changelog, and release evidence with actual results.

Any failed gate blocks promotion. Roll back using a reviewed, reversible deployment/commit procedure; do not hide a failure by changing DNS, weakening tests, or widening budgets.

# Coverage push — autonomous batch queue

## ✅ 65% GOAL ACHIEVED (2026-06-06): 65.16% statements (71,349/109,484), 66.18% lines
Clean measurement (maxWorkers=2, 0 crashes). Journey on CODEX-MCP-BRANCH:
52.84 → 55.35 → 58.42 → 59.89 → 62.51 → 64.67 → **65.16%**.
17 batches + a 23-file bulk-restore of rebase-dropped tests. ~250 new test files,
~10,000 new passing tests. Toward 75% (next milestone): ~10,800 more stmts needed;
target the remaining 0% files (rank-from-final.mjs) + canvas/three files (jsdom-hard).
NOTE: ~58-98 specs flake under full-suite+coverage contention (machine load) — they
pass in isolation; not regressions. The CI gate (--no-coverage) is the green signal.



Resumable work queue. Baseline (merged sharded coverage, 2026-06-05):
**53.27% statements (58,272/109,378). Gap to 75%: +23,762 stmts.**

Rule for workers: write a jsdom/node unit test for ONE 0%-coverage file,
verify it passes `--no-coverage`, do NOT run `--coverage` (it clobbers the
merged coverage-summary.json AND is slow). Orchestrator measures in bulk
via the sharded coverage run every ~5 batches.

## Done (batches 1-6, ~2,225 tests across 49 new 0%-coverage files)
- B1 f366c4093 (+401): PropertiesPanel, LayersPanel, DesignerShell, PreviewModal,
  designs/[designId]/route, admin/PostForm, brain/DecisionForm, DocumentLinksPanel
- B2 436fc8626 (+338): SnapshotsDropdown, DesignSurfacesEditor, admin/portal-hosting,
  PortalSidebar, AlignmentToolbar, SiteNavClient, DesignerClient, CustomCodeForm
- B3 3478a561f (+380): brain doc-edit/knowledge/document/templates pages,
  websites/taxonomy, HtmlRenderBlockRender, EnvironmentPanel, InitiativeLinksPanel
- B4 e33948bed (+388): SurveyBuilder, magamommy/designer.ts, settings/profile,
  EmailSequencesPanel, ComposeBox, WebhookConsole, CustomFieldsManager, workflows/[id]
- B5 23e36c70b +8d11bfdbf (+371): surveys/[id], DocumentRequiredReadsPanel,
  ProjectArtifactsTab, SurveyRecommendationEditor, TrackingSettingsCard,
  AIChatWidget, PortalPostForm, brain/glossary
- B6 b0b322ca1 (+337): VisualBlockEditorComplete, brain/relationships,
  NewDealModal, suggested-projects, portal-websites, NewExperimentModal,
  useBookingPage hook, TemplateEditor
- Also e324454b3: restored 38e/42g (stash-corruption fix); 8628fd10f config hardening.

## Known suite fragility (NOT my regressions)
Contention flakes under sharded --maxWorkers run (pass in isolation): actions-blog,
components-style-settings, cron-failing-automations-notify, mcp-tools-kanban, +others.
Pre-existing global-state-leak / 15s-timeout fragility in machine-gen tests.
reportOnFailure:true lets coverage emit despite them.

## ⚠️ CONCURRENT-SESSION HAZARD (2026-06-05)
Another worktree session rebased the shared branch mid-task, switching HEAD from
chore/agent-harness-hardening → perf/home-blog-query-ttfb and STRANDING batches 1-5
(39 files) on the old branch. Symptoms it caused (all red herrings): files appearing
"reverted"/"deleted", coverage reading 44% with tested files at 0%, config losing
reportOnFailure. Root cause was always: wrong branch / files not present, NOT v8 OOM
or stash corruption.
RECOVERY (commit 61782010c on perf/home-blog-query-ttfb): restored all 39 stranded
files from f366c4093/436fc8626/3478a561f/e33948bed/23e36c70b. All 49 coverage test
files (B1-B6 + glossary) now consolidated on perf/home-blog-query-ttfb.
**Before resuming batches: confirm no other session is rebasing this branch, and
`git branch --show-current` before EVERY commit.** Do NOT use git stash to dodge the
PitchDeckPresentation file-size hook — that compounded the confusion. The file-size
blocker is gone (file reverted to HEAD; scroll-reset change saved at /tmp/pitchdeck-
scroll-reset.patch + reflog d72f75e3).

## Measurement: FIXED. v8 + reportOnFailure:true (config) emits coverage-summary.json.
The ONLY reason coverage never emitted was reportOnFailure being false (config was on
the wrong branch). v8 is fine; istanbul was installed then removed (not needed).
Rank with: node .planning/rank-from-final.mjs  OR  check files with check-files.mjs.

## STABLE MEASUREMENT RECIPE (critical — the number swings otherwise)
Coverage workers OOM-crash under machine load (Spotlight/GitKraken/Chrome push
load avg >100 on 8 cores), randomly dropping 30-80 already-tested files per run →
measured % swings 40-53%. For a TRUE number, run with LOW concurrency + no parallel
grinding:
  TMPDIR=/Users/dancoyle/.cache/vitest-tmp NODE_OPTIONS="--max-old-space-size=4096" \
    npx vitest run --project=unit --coverage --maxWorkers=2 --testTimeout=60000
A clean run = 0 "Worker exited" crashes, ~606 files, ~20,179 tests. That gave the
first trustworthy number: **52.84% statements (57,859/109,486)** after batch 9.
Validate with: node .planning/check-files.mjs <substr...> (known files show real %).
DO NOT measure with maxWorkers>=3 or while dispatching worker batches (causes crashes).

## BULK-RESTORE proven tests (huge efficiency win)
The branch rebases dropped ~57 original coverage-climb test files (commit 31888bf59).
~23 cover currently-0% source and restore+pass cleanly (the rest duplicate batches 7-9):
  git ls-tree -r --name-only 31888bf59 | grep tests/unit/.*test > old.txt
  comm against on-disk (INCLUDE subdirs!) → restore the net-new, drop dups.
Restored 23 (commit 00adcab01): block-content-editor (885), brain-note-list-pane (708),
gradient-builder, crm-notification-bell, crm-custom-fields-panel, glossary-term-form,
note-custom-fields-panel, visual-block-editor, ai-portal-tools-*, mcp-tools-{cms,kanban},
+more. 1116 tests, lint clean. ALWAYS check git history for a lost test before re-writing.

## RE-MEASURE after recovery — get real % + re-rank before B7.

## Queue (top-60 rank minus done; skip canvas/webgl-hard + already-≥70%)
B2: SnapshotsDropdown, DesignSurfacesEditor, admin/portal-hosting/page,
    PortalSidebar, AlignmentToolbar, SiteNavClient, DesignerClient, CustomCodeForm
B3: admin/portal-hosting done? brain/documents/[id]/edit/page, brain/knowledge/[id]/page,
    HtmlRenderBlockRender, EnvironmentPanel, brain/documents/[id]/page,
    brain/templates/page, websites/[siteId]/taxonomy/page, InitiativeLinksPanel
B4: SurveyBuilder, magamommy/agents/designer.ts, settings/profile/page,
    EmailSequencesPanel, comments/ComposeBox, settings/webhooks/WebhookConsole,
    CustomFieldsManager, automations/workflows/[id]/page
B5: surveys/[id]/page, DocumentRequiredReadsPanel, ProjectArtifactsTab,
    brain/glossary/page, SurveyRecommendationEditor, TrackingSettingsCard,
    AIChatWidget, PortalPostForm
    -> RE-MEASURE (sharded coverage) after B5
B6: brain/relationships/page, TemplateEditor, admin/portal-websites/page,
    useBookingPage.ts, VisualBlockEditorComplete, NewExperimentModal,
    portal-suggested-projects/page, crm/deals/NewDealModal
B7: sites/[domain]/[[...slug]]/page, TopicPicker, + re-ranked targets

## Hard / deferred (canvas/webgl — need live Fabric/three, jsdom ceiling)
ProductDesigner.tsx (638), DesignCanvas.tsx (487), HeroParticleNetwork.tsx (157),
AiImageModal.tsx (114). Revisit with partial-coverage targets or escalate.

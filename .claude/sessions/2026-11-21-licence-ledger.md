# 2026-11-21 — Roadmap 4.6: licence ledger

**Accomplished:**
- Roadmap 4.6 on `docs/4.6-licence-ledger`, a PR into `visual/integration`.
- `docs/licenses.md` records where every shipped third-party or generated thing came from, plus a pre-commercial-release checklist.
- `src/assets/licenseLedger.test.js` guards it. All its checks are derived from disk: transitive runtime dependencies with their licences, shipped asset folders, and first-column ATTRIBUTIONS rows.
- Pipeline:
  - recon, which established the facts first: Draw Things reports `flux_1_schnell_q8p.ckpt`, the backgrounds came from ChatGPT per a5ad396 rather than Midjourney, and every audio file has a credit row;
  - licence sources checked on the web;
  - a short spec and a plan, then review-plan;
  - one Sonnet task, then one Opus review serving as both task and final review ("with fixes": opengameart missing; eventemitter3 and vendored Earcut unrecorded; two test holes proven by mutation);
  - one fix wave, re-reviewed with all 14 items ADDRESSED.
- 4113 tests; build exit 0. Docs and a test only.

**Decisions made (the user said "move on"; these are Claude's calls):**
- The ledger plus a derived guard test, rather than a hand-written doc only or a generated ledger.
- Shipping a notices file in the build is a release action (backlog #81), not part of 4.6.
- The OpenAI terms are paraphrased, not quoted.
- The unverified T5/CLIP conversion licences are flagged, not asserted.
- Title/trademark clearance went to backlog #82, which is the user's call.

**Where we left off:**
- The 4.6 PR is open.
- Roadmap Phase 4 MVP items 4.0–4.2 and 4.6 are done. 4.3–4.5 remain.
- Backlog: #78, #79, #81, #82.
- Waiting on the user:
  - G3: the desktop half, plus a real-phone check of 4.1;
  - the #30 playtest;
  - merging `visual/integration` into `main`;
  - #82, title clearance.

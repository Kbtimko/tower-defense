# 4.6 Licence Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write `docs/licenses.md` and a derived guard test that fails when a runtime dependency, shipped asset folder or audio file is missing from the ledger/attributions.

**Architecture:** One Markdown document plus one Vitest file that reads `package.json`, `node_modules/*/package.json`, the `public/` tree and the two docs from disk.

**Tech Stack:** Markdown, Vitest 2 (node fs).

**Spec:** `docs/superpowers/specs/2026-11-21-licence-ledger-design.md` (its "Facts gathered" section is the ledger's content — use those exact names, versions, file names and the commit reference).

## Global Constraints

- Every licence claim in the ledger links a source URL (official repo/model card/terms page). Use: FLUX.1 [schnell] https://huggingface.co/black-forest-labs/FLUX.1-schnell ; IS-Net/DIS https://github.com/xuebinqin/DIS ; rembg https://github.com/danielgatis/rembg ; OpenAI terms https://openai.com/policies/terms-of-use/ ; Phaser https://github.com/phaserjs/phaser ; Orbitron https://fonts.google.com/specimen/Orbitron ; Rajdhani https://fonts.google.com/specimen/Rajdhani ; OFL https://openfontlicense.org ; Kenney https://kenney.nl ; T5 https://github.com/google-research/text-to-text-transfer-transformer ; CLIP https://github.com/openai/CLIP.
- Never name a tool that was not used (no Midjourney except to say it was planned and not used).
- The ledger states "not legal advice" and "last verified 2026-11-21".
- The guard test derives every list from disk; each loop asserts it found > 0 items.
- Conventional Commits; explicit `git add` paths; end commits with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A new runtime dependency added later → Task 1 test `every runtime dependency is in the ledger with its declared licence`.
2. A new folder under `public/assets/` (e.g. props from roadmap 4.4) → Task 1 test `every shipped asset folder is named in the ledger`.
3. A new audio file without a credit row → Task 1 test `every audio file has an ATTRIBUTIONS row`.
4. The `.ogg` and `.mp3` twins of one track share a stem → the audio test checks stems, not file names.
5. `public/` also holds non-asset files (e.g. a favicon) → the folder test checks directories only.

---

### Task 1: Ledger document and guard test

**Files:**
- Create: `docs/licenses.md`
- Create: `src/assets/licenseLedger.test.js`
- Modify: `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md` (tick 4.6: `- [ ] **4.6` → `- [x] **4.6`, append `*Done 2026-11-21: docs/licenses.md + src/assets/licenseLedger.test.js.*`)

**Interfaces:** none (standalone).

- [ ] **Step 1: Write the failing test** `src/assets/licenseLedger.test.js` (repo root via `process.cwd()`, `fs` + `path`):
  - `every runtime dependency is in the ledger with its declared licence`: for each key `pkg` of `package.json` `dependencies`, read `node_modules/<pkg>/package.json` `license`; assert some line of `docs/licenses.md` contains both `pkg` and that licence string. Assert ≥ 1 dependency.
  - `every shipped asset folder is named in the ledger`: for each directory directly under `public/` and under `public/assets/`, assert `docs/licenses.md` contains its repo path (`public/audio`, `public/particles`, `public/assets/sprites`, …). Assert ≥ 1 found.
  - `every audio file has an ATTRIBUTIONS row`: for each file in `public/audio/sfx` and `public/audio/music`, its stem (name without extension) appears in `public/audio/ATTRIBUTIONS.md` as `` `<stem>.``. Assert ≥ 1 found.
- [ ] **Step 2: Run** `npx vitest run src/assets/licenseLedger.test.js` — Expected: FAIL (ledger file missing). The audio test should already PASS (record that; it guards the existing file).
- [ ] **Step 3: Write `docs/licenses.md`** per the spec's Design section and the Facts gathered, with the Global Constraints' source URLs.
- [ ] **Step 4: Run** the test file — Expected: PASS. Then prove the dependency and folder tests bite: temporarily delete the `phaser` row's licence word and the `public/particles` mention from the ledger, run, see both FAIL, restore. Record in the report.
- [ ] **Step 5: Tick roadmap 4.6** as in Files.
- [ ] **Step 6: Run** `npx vitest run` — Expected: all pass.
- [ ] **Step 7: Commit**
```bash
git add docs/licenses.md src/assets/licenseLedger.test.js docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md
git commit -m "docs(licences): licence ledger for every shipped asset and dependency (4.6)"
```

## After the task (controller)

Final review (Opus) of the ledger's claims against the spec facts and sources. "Live" verification for a docs change: run the guard test against a deliberately added fake dependency / asset folder in a scratch copy to show it fails, and `npm run build` to confirm nothing shipped changed.

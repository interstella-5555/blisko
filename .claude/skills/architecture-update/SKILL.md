---
name: architecture-update
description: "Use after implementing code changes, before creating a PR, to sync architecture documentation with what changed in the code. Triggers: 'update architecture', 'update docs', 'architecture update', '/architecture-update'."
---

# Architecture Update — Post-Implementation Doc Sync

Update architecture docs in `docs/architecture/` to reflect code changes on the current branch. Run AFTER implementation, BEFORE creating a PR.

## Procedure

### 1. Identify what changed

```bash
git diff origin/main...HEAD --name-only
git log origin/main...HEAD --oneline
```

### 2. Map changes to architecture docs

Use the file->doc mapping from `.claude/rules/architect.md` to identify which architecture docs need updating.

### 3. Read affected architecture docs

For each mapped doc, read the current content. Note:
- Sections that describe behavior you changed
- Values (limits, concurrency, model names) that may have changed
- Impact Map entries that may need new cross-references

### 4. Read the actual code changes

```bash
git diff origin/main...HEAD -- <relevant files>
```

Understand exactly what changed and why.

### 5. Update architecture docs

For each affected doc:

**Update existing sections** where behavior changed:
- Change descriptions to match new code
- Update specific values (limits, config, model names)
- Add "Why" context for non-obvious changes

**Add new sections** for new features/components:
- Follow existing doc structure
- Include: What it does, Why it was built this way, Impact on other systems

**Update Impact Map** at the end of each doc:
- Add new cross-references if the change affects other systems
- Remove stale references if they no longer apply

**Update Terminology section** if naming changed.

### 6. Format

When updating a doc, add an update marker after the header:

```markdown
> Updated YYYY-MM-DD — [brief description of what changed]
```

Keep multiple update markers (chronological) — they show doc evolution.

### 7. Sync CLAUDE.md cross-references

CLAUDE.md has `<!-- arch-ref: docname.md -->` markers linking Quick Reference sections to architecture docs. After updating an architecture doc, grep CLAUDE.md for its marker:

```bash
grep -n "arch-ref:.*<docname>" CLAUDE.md
```

If found, verify the CLAUDE.md section still matches the architecture doc. If not, update CLAUDE.md too.

### 8. Verify completeness

After updating, check:
- [ ] Every schema change reflected in `database.md`
- [ ] Every new queue job type in `queues-jobs.md`
- [ ] Every new WS event in `websockets-realtime.md`
- [ ] New tables -> GDPR checklist in `gdpr-compliance.md`
- [ ] New PII fields -> anonymization section updated
- [ ] Impact Maps updated in all affected docs
- [ ] CLAUDE.md `<!-- arch-ref: -->` sections still aligned

### 9. Show diff to user

After updating, show a summary of doc changes for user review before committing.

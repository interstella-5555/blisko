# `linear` — Linear integration conventions

Team: **Blisko**, key: **BLI**

- `linear/raw-markdown` — Pass raw markdown with real newlines to `save_issue` description. NOT escaped strings with `\\n`.

- `linear/no-blockquote-numbers` — Don't start lines with `>` followed by text (e.g. `>5 członków`). Linear treats it as blockquote. Use words: "Więcej niż 5".

- `linear/checkbox-syntax` — Checkboxes: `- [ ]` not `\[ \]`.

- `linear/verify-render` — Always check response from `save_issue` to verify markdown rendered correctly.

- `linear/no-attachment-upload` — Don't attach images via `create_attachment` (unreliable). Reference HTML mockup file paths in ticket descriptions.

- `linear/self-contained-subtasks` — Every sub-issue must be **fully self-contained**: own acceptance criteria, all implementation info (code snippets, file paths, props, styles) in the description. Never reference parent's criteria or external files from ticket descriptions. Each sub-ticket stands alone — someone reading only it should have everything needed to implement.

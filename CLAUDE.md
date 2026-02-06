# Blisko — Project Notes

## Regenerating README screenshot

The README includes a screenshot of 4 design book screens (Login, OTP, Profile, Waves).
The screenshot mode is built into the codebase — no temporary changes needed.

**How it works:**
- `?screenshot` query param on `/design-book` renders only `<Screens onlyFirstRow />` on a white background, hiding the sidebar and all other sections.
- `onlyFirstRow` prop on `Screens` component renders Login, OTP, Profile, and Waves Received in a single row.

**To regenerate:**

1. Make sure the dev server is running (`localhost:3000`)
2. Capture the screenshot:
   ```bash
   npx capture-website-cli "http://localhost:3000/design-book?screenshot" \
     --width 1400 --scale-factor 2 --delay 3 --full-page \
     --disable-animations --remove-elements ".nav" \
     --output docs/screens-vN.png
   ```
3. Update `README.md` to point to the new filename
4. Delete the old screenshot file and commit

**Key files:**
- `apps/design/src/routes/design-book.tsx` — `?screenshot` detection and early return
- `apps/design/src/components/design-book/Screens.tsx` — `onlyFirstRow` prop

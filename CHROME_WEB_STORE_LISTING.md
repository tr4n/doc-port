# Chrome Web Store — listing notes (copy-paste ready)

Use this file when filling the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
Replace bracketed placeholders (e.g. your privacy policy URL) before publish.

---

## Package / upload

| Field | Value |
|--------|--------|
| **ZIP to upload** | Contents of `dist/` only (after `npm run build`). Zip *inside* `dist`, not the repo root. |
| **Example command** | `cd dist && zip -r ../docport-v1.0.0.zip . && cd ..` |
| **Manifest version** | Match `version` in `manifest.json` (e.g. `1.0.0`) |

---

## Store listing — English (recommended for global audience)

### Extension name (max ~75 chars)

**DocPort — Docs to Word Exporter**

*(Alternative shorter: **DocPort — Export Google Docs to Word**)*

### Short description (132 characters max on store; keep concise)

**Export Google Docs (including view-only) to a formatted .docx with tables, images, and links — all in your browser.**

*(Character count: verify in dashboard before submit.)*

### Detailed description (for “Description” field)

**DocPort** turns the Google Doc you have open into a **real Microsoft Word `.docx` file** — without needing edit access or Google Drive API keys.

**What it does**

- Works on **view-only** documents as long as you can open them in the browser.
- **Preview** parsed content before download.
- **Export** headings, bold/italic/underline, colors, bullet & numbered lists, tables, images, and hyperlinks.
- **Runs locally**: content is fetched with your existing Google session in the active tab; nothing is uploaded to third-party servers by this extension.

**How to use**

1. Open a Google Docs document (`docs.google.com/document/...`).
2. Click the **DocPort** icon.
3. Tap **Preview** to verify text, tables, and images.
4. Tap **Export .docx** to download.

**Permissions**

- **Active tab** — only when you interact with the extension.
- **Scripting** — to read the simplified “mobile” HTML view of the current document using your login (same as opening that view yourself).

**Privacy**

- No analytics, no remote servers, no document storage. See the privacy policy linked in the listing.

**Not affiliated with Google.** Google Docs is a trademark of Google LLC.

---

## Category

- **Primary:** Productivity

---

## Language

- **Default / primary:** English (United States) or English (International)

Add additional store locales later if needed (same strings translated).

---

## Privacy practices (dashboard questionnaire)

Typical honest answers for this extension:

| Question | Suggested answer |
|----------|-------------------|
| **Does the extension handle user data?** | Yes — document content is processed **only on the user’s device** to build the file. |
| **Is data sold?** | No |
| **Is data used for purposes unrelated to the extension?** | No |
| **Is data transferred encrypted?** | N/A for “no transfer to your servers”; HTTPS is used for requests to Google. |

**Privacy policy URL (required):**  
`https://YOUR_DOMAIN_OR_GITHUB_PAGES/docport-privacy`  
*(Host a one-page policy stating: no collection, no sale, all processing local, contact email.)*

---

## Single purpose

**One sentence:**  
The extension exists solely to export the **currently open Google Docs page** to a downloadable **`.docx`** file.

---

## Permission justifications (if the dashboard asks for “reason for permission”)

**`activeTab`**  
Used only when the user opens the popup, to run scripts on the tab that is currently showing a Google Docs document.

**`scripting`**  
Required to inject a small script into the active Docs tab that fetches the document’s simplified HTML and embedded images using the user’s existing Google session cookies.

**Host permission `https://docs.google.com/*`**  
Limits injection and network requests to Google Docs origins only, consistent with the single purpose above.

---

## Screenshots & promo assets

| Asset | Size | Notes |
|-------|------|--------|
| **Screenshots** | At least **1280 × 800** px (or 640 × 400 per some guidelines — check current [Chrome image guidelines](https://developer.chrome.com/docs/webstore/images)) | Show: popup with **Preview** visible, or before/after. Minimum **1** screenshot. |
| **Small promo tile** | **440 × 280** px | Optional; improves discoverability. |
| **Marquee promo** | **1400 × 560** px | Optional. |

**Tip:** Use a clean browser profile, blur any private doc titles if needed.

---

## Support / contact

| Field | Value |
|--------|--------|
| **Support email** | quanghuytran.hust@gmail.com |
| **Website** (optional) | Your repo URL or landing page |

---

## Developer account checklist

- [ ] Pay one-time **Chrome Web Store developer registration** fee (if not already done).
- [ ] Privacy policy URL is **public** and mentions “DocPort” / extension name.
- [ ] `manifest.json` **version** bumped for each upload.
- [ ] Build fresh: `npm run build`, zip **`dist/`** only.
- [ ] Test **Load unpacked** on a clean profile before each publish.
- [ ] Trademark: do **not** claim “official Google product”; keep disclaimer in long description.

---

## Author (for your records)

**Author:** Quang Huy Tran  
**Email:** quanghuytran.hust@gmail.com  

Also set in `package.json` (`author`) and `manifest.json` (`author`) for the shipped build.

---

## Version history (maintain as you ship)

| Version | Date | Notes |
|---------|------|--------|
| 1.0.0 | YYYY-MM-DD | Initial release |

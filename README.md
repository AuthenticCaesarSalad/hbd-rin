# BirthdayWishes — Putri Karina 🎂

A soft, animated birthday site built with plain **HTML, CSS and JavaScript**.
No build step, no framework, no npm dependencies — open the files and it runs.

```
index.html      Hero, countdown, quick wish form
messages.html   Wish wall — add, read, delete
gallery.html    Photo & video gallery — upload, filter, lightbox
thank-you.html  Stats, confetti, social share
styles.css      Design system, animations, responsive + a11y
script.js       All behaviour and storage
```

---

## 1. Running it locally

Open `index.html` directly in a browser, or serve the folder (recommended, so
`fetch` and IndexedDB behave normally):

```bash
# any one of these
python -m http.server 8080
npx serve .
```

Then visit `http://localhost:8080`.

---

## 2. Two storage modes

`script.js` decides its mode automatically from the `BACKEND` block at the top.

| | **Local mode** (default) | **Shared mode** |
|---|---|---|
| Messages | `localStorage` | Supabase table |
| Photos / videos | IndexedDB (Blobs) | Supabase Storage + `media` table |
| Visitor count | `localStorage` | `visits` table via `increment_visits()` |
| Who sees it | only that one browser | **every visitor, every device** |

**Local mode** needs zero setup and is what you get today. It is fine for a
single-machine demo, but a wish you leave on your laptop is invisible to Putri.

**Shared mode** is what makes the site a real group gift. Setup is ~5 minutes.

---

## 3. Enabling the shared backend (Supabase)

### 3.1 Create the project
1. Sign up at <https://supabase.com> (free tier: 500 MB database, 1 GB storage).
2. Create a project. Note the **Project URL** and the **anon public** key under
   *Settings → API*.

### 3.2 Create the schema, bucket and policies

Everything the database needs is in **one file: `supabase-schema.sql`**.

1. Open *SQL Editor → New query*.
2. Paste the whole of `supabase-schema.sql` and click **Run**.
3. Check the **Results** tab: the final query returns `messages`, `media` and
   `visits`. That means it worked.

That single script creates:

| Object | Purpose |
|---|---|
| `public.messages` | the wish wall |
| `public.media` | photo/video metadata (files themselves go in Storage) |
| `public.visits` | one shared visit counter |
| `increment_visits()` | security-definer function that bumps the counter |
| `birthday-media` bucket | public Storage bucket for uploads, with a 50 MB cap |
| RLS policies + grants | read/write rules for `anon` on all of the above |

It is **idempotent** — running it again is safe and won't duplicate anything.
You do not need to create tables or the bucket by hand in the dashboard; the
script does both. The wish wall starts empty; the first real wish is whichever
friend gets there first.

> **Do not** add the `service_role` key to the site. The public `anon` key is
> the right one — the RLS policies above are what constrain it.

### 3.3 Point the site at it

Edit the `BACKEND` block at the top of `script.js`:

```js
const BACKEND = {
    supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
    messagesTable: 'messages',
    mediaTable: 'media',
    mediaBucket: 'birthday-media',
    visitsTable: 'visits'
};
```

Reload the page. The console prints `[birthday] Shared backend mode: …`.
Leave both values empty to fall back to local-only mode.

---

## 4. Hosting (PRD open question 2)

The site is fully static, so any static host works and all of them are fast and
free for this size. Pick one:

| Host | How | Notes |
|---|---|---|
| **Netlify** | drag the folder onto app.netlify.com/drop | Simplest; custom domain + HTTPS free |
| **Cloudflare Pages** | connect a Git repo, build command: *(none)*, output dir: `/` | Fastest global CDN |
| **Vercel** | `vercel` CLI or Git import, framework preset: *Other* | Good dashboard |
| **GitHub Pages** | push to a repo, enable Pages | Fine, slightly slower |

After deploying, add the live URL to your share text and (if you like) update
`initShare()` in `script.js`.

**Custom domain:** buy or use an existing domain, then add it in the host's
dashboard. HTTPS is automatic on all of the above.

---

## 5. Backup (PRD open question 3)

Three separate things need backing up.

**a) Database (messages, media metadata, visit count)**

```bash
# Full dump — run from a machine with psql
pg_dump "postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres" \
  --data-only --table=public.messages --table=public.media --table=public.visits \
  > backup-$(date +%F).sql
```

Also available in the Supabase dashboard under *Database → Backups*
(daily automatic backups on paid plans; on the free plan, schedule the dump
above yourself — a weekly cron or a reminder is enough).

**b) Uploaded media (the actual photo/video files)**

Download the whole bucket:

```bash
# Supabase CLI
supabase storage cp -r ss:///birthday-media ./backup-media

# or, with rclone configured for the S3 endpoint
rclone copy supabase:birthday-media ./backup-media
```

Keep this in at least two places (e.g. your laptop + a cloud drive). Media is
the least replaceable part — the wishes are text and the code is in Git.

**c) Code**

Keep the six files in a Git repository and push it somewhere private
(GitHub/GitLab). That is your version history and your deploy source.

**Suggested rhythm:** code on every change (Git), database weekly, media after
each party/batch of uploads. Before any paid Supabase plan lapses, export both.

---

## 6. Maintenance (PRD open question 4)

**Who:** agree on one owner. Practically the person who holds the Supabase
and hosting logins. Everyone else can contribute wishes and photos without
any account.

**Ongoing tasks**
- **Moderate content.** Anyone with the link can post. Remove spam or
  off-topic uploads with the `×` on a card/tile, or in Supabase
  *Table Editor → messages / media* (deleting a `media` row does **not**
  delete the file — remove it from the bucket too, or use the site's delete
  button which does both).
- **Watch the free-tier quotas.** Supabase free: 1 GB storage, 5 GB egress.
  Video uploads eat this fastest. If it fills up, uploads fail and the UI shows
  an error rather than losing data.
- **Rotate the anon key** (*Settings → API → Regenerate*) if the site is ever
  abused, then update `BACKEND.supabaseAnonKey` and redeploy.
- **No dependency upkeep.** There is no npm tree to patch. The only externals
  are the two Google Fonts and Supabase itself.
- **Handover note:** write down the Supabase project ref, the hosting account,
  and where the backups live. This is the difference between "we can keep it
  running" and "nobody knows the password".

**After the birthday:** the site is a nice permanent keepsake. Consider
exporting the DB and bucket, then either leaving it up on the free tier or
taking a static snapshot with the messages baked in.

---

## 7. Security notes (read before a public launch)

- **The anon key is meant to be public.** It ships in `script.js`. It is safe
  *only because* Row Level Security restricts what it can do. Never paste the
  `service_role` key into the front end — that one bypasses RLS entirely.
- **Open write policies are the real risk.** The policies above let anyone who
  has the URL post wishes and upload files. Mitigations, in order of effort:
  1. Keep the URL unlisted and share it only with friends.
  2. Add a shared passphrase gate before the forms unlock.
  3. Enable Supabase CAPTCHA (Auth settings) to block bots.
  4. Route writes through an Edge Function with rate limiting.
  5. Require a magic-link sign-in so every post is attributable.
- **Content escaping.** All user text is inserted with `textContent`, never
  `innerHTML`, so a wish cannot inject script into another visitor's browser.
- **Upload size.** The 50 MB limit is enforced client-side; also set a bucket
  limit server-side so a crafted request cannot bypass it.
- **HTTPS is required** for the clipboard fallback and is automatic on every
  host listed above.

---

## 8. Customising

- **Name / birthday:** `CONFIG` at the top of `script.js`
  (default: 11 September).
- **Colours:** the `:root` custom properties at the top of `styles.css`.
- **Card palette:** the five `.color-*` classes in `styles.css` map to the
  colour choices in the message form.
- **Accessibility:** the site targets WCAG 2.1 AA — semantic landmarks, skip
  links, ARIA labels/live regions, visible focus rings, full keyboard
  operation, and `prefers-reduced-motion` support. Keep these if you edit.

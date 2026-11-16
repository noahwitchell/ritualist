# Ritualist — notes for Claude

- Owner: Noah. Repeating lists (daily → yearly) + free lists, with adaptive check-ins, stats, achievements and
  three daily reminders. Phone first (installed PWA). Same setup as ~/Claude/EveryDay: no build step, no deps.
- Keep the interface uncluttered: few buttons, one tap to tick, details live in the task sheet.
- All rules live in `js/core.js` (classic script, exposes globalThis.Core); run `node --test tests/core.test.mjs`
  after changing them.
- Data is localStorage `ritualist.v1` (tasks, lists, todos). The Tasks tab pages = PAGES: `todo` (one-off to-dos, time sizes 5/15/30/60 → --t5…--t60 colours) then the six cycles. Never change its shape without a migration in `Core.normalize`. If load fails, store.js sets the raw text aside in `ritualist.rescue` (auto-restores once readable if nothing new was added; Settings "Older data" otherwise; daily backup pauses meanwhile).
- Removing data = hold to confirm. Retire ("let it go") keeps history; delete is forever.
- `push/vapid-private.json` is the push signing key: git-ignored, never commit or print it.
- Dark only. Fonts (Fraunces display, Figtree text, OFL) live in fonts/; swap via --display/--text in css/app.css.
- Verify at phone size (390×844). Bump CACHE in sw.js when shipping.
- Reminders are sent by `worker/` (Cloudflare Worker `ritualist-reminders` + D1 `cadence` (old internal name, unseen), Noah's account,
  https://ritualist-reminders.noahschmoah.workers.dev). The app signs itself up (`Push.sync`); cron every minute.
  Deploy: `cd worker && npx wrangler@4 deploy`. Tests: `node --test worker/test.mjs`. The private key is the
  Worker secret VAPID_PRIVATE_JWK. `push/send.mjs` is the old manual sender, kept for one-off sends.
- Daily backup (`js/backup.js`): state → gzip → AES-GCM with a 32-byte key made on the phone, shown once
  as a Crockford-base32 recovery key; the Worker stores only ciphertext under id = SHA-256(key + tag)
  (`/backup/put|get|delete`, table `backups`). Never send the key itself anywhere. Tests: tests/backup.test.mjs.

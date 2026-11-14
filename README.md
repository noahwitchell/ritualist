# Ritualist

Lists that repeat, and notice how you're doing.

- **Repeat** tab: Daily, Weekly, Monthly, Quarterly, Twice a year, Yearly. Swipe between them or tap the strip.
  Tap the circle to tick; done items slide to a struck-through *Done* section at the bottom. Everything resets
  when its period turns over (a day starts at 3 AM, weeks start Monday).
- Tap a task to rename it, star it as a priority (stars float to the top and lead the morning reminder),
  change how often it repeats, see its history, or let it go.
- **Check-ins:** if a task slips (4 of the last 5 days, 2 of the last 3 weeks or months, …) a card asks whether it
  should repeat less often, get smaller, or go. Streaks, a fully ticked list and comebacks get a thumbs-up.
- **Lists** tab: brain dump, groceries, wish list, plus any you make. A brain-dump item can become a repeating task.
- **Progress** tab: today's ring, 6-month heat map, month by month, every task's hit rate, achievements,
  and a timeline of how your lists have changed.
- **Reminders:** morning heads-up, midday check-in, evening wind-down. Settings shows exactly what each would say.

All data stays on the phone (localStorage, mirrored to Cache Storage so the service worker can read it).
Settings → Save backup writes a JSON file.

## Reminders (web push)

Turning on reminders signs the phone up with the sender in `worker/` (a Cloudflare Worker with a D1
database): its push address, three times and time zone, nothing else. Every minute the Worker sends an **empty**
push to any phone whose reminder is due; the service worker wakes, reads the local lists and writes the reminder,
so list contents never leave the phone. Deploy with `cd worker && npx wrangler@4 deploy`.

## Develop

```bash
python3 -m http.server 5185   # then http://localhost:5185
node --test tests/core.test.mjs
```

- `js/core.js` every rule (periods, streaks, check-ins, achievements, reminder text). A classic script so the page,
  the service worker and node tests all share it.
- `js/app.js` screens and interaction · `js/store.js` storage + backups · `js/push.js` reminder sign-up
- `sw.js` offline cache, push → notification · `worker/` the reminder sender (Cloudflare) · `push/send.mjs` manual one-off sender
- `python3 tools/make_icon.py && tools/render_icons.sh` rebuilds the icons

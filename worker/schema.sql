-- One row per phone with reminders on. Only the push address, times and time zone are kept.
CREATE TABLE IF NOT EXISTS subs (
  id TEXT PRIMARY KEY,          -- SHA-256 of the push endpoint
  sub TEXT NOT NULL,            -- the push subscription JSON
  tz TEXT NOT NULL,             -- IANA time zone, e.g. America/Los_Angeles
  morning TEXT NOT NULL DEFAULT '',
  midday TEXT NOT NULL DEFAULT '',
  evening TEXT NOT NULL DEFAULT '',
  sent_morning TEXT,            -- local date each reminder last went out
  sent_midday TEXT,
  sent_evening TEXT,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);

-- One encrypted backup per recovery key. The server can't read `data`: it is AES-GCM ciphertext
-- made on the phone, and `id` is a hash of the key, not the key.
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);

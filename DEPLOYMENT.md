# Installing Campus ERP (EQR) on your own server

The app is a TanStack Start + Vite project that compiles to a self-contained Node
server (Nitro's `node_server` preset) plus a folder of static browser files. On a
server it runs as two containers: nginx terminates TLS, serves the static build
output from disk, and proxies everything dynamic to Node. Databases and auth stay
external — Supabase, Appwrite and Clerk are hosted services this project talks to
over HTTPS, so nothing else needs to be installed locally.

```
browser / installed PWA
        │  :80 / :443
        ▼
   web (nginx)
     ├── static files from /usr/share/nginx/html   (js, css, icons, sw.js, manifest)
     └── / ──► app (node :3000) ──┬──► Supabase / Appwrite / Clerk
                                  └──► /data (eqr-data volume): attendance store
```

QR attendance is the exception to "nothing is stored on the server": sessions,
scans and class rosters are written to `DATA_DIR` (default `/data`) as JSON, and
mirrored to Supabase when the mirror is configured. See section 9.

The split matters: Nitro answers static requests with a `Content-Length` it baked
while bundling the server, but `vite-plugin-pwa` rewrites `sw.js` after that
snapshot — served through Node the worker arrives truncated mid-statement and the
browser refuses to install it. nginx reading the file from disk is the fix.

Files added for this:

| File | Purpose |
| --- | --- |
| `Dockerfile` | 4 stages: deps → `NITRO_PRESET=node_server` build → Node runtime (non-root) → nginx web tier |
| `.dockerignore` | Keeps `node_modules`, `.output`, `.git` and local env files out of the image |
| `docker-compose.yml` | `app` + `web` (+ on-demand `certbot`), healthchecks, restart policies |
| `deploy/nginx/conf.d/eqr.conf` | Baked into the `web` image: static rules, proxy headers, gzip, upload size, optional TLS |
| `.env.server.example` → `.env.server` | Build-time and runtime configuration (git-ignored) |

---

## 1. Prerequisites

- Linux server with Docker Engine + the Compose plugin (`docker compose version`).
- 1 vCPU / 1 GB RAM is enough for the app; the build step wants ~1 GB free.
- A DNS `A`/`AAAA` record pointing at the server (needed for HTTPS and for PWA install).
- Ports 80 and 443 open in the cloud/security-group firewall.
  Do **not** publish 3000 — the `web` container is the only thing that should face
  the internet.

## 2. Get the code

```bash
git clone https://github.com/aniruddhasali800-pixel/EQR.git /srv/campus-erp
cd /srv/campus-erp
```

## 3. Configure

```bash
cp .env.server.example .env.server
nano .env.server          # fill in Supabase URL + keys, then:
chmod 600 .env.server
```

Which group a value belongs to matters:

- `VITE_*` values are **inlined into the browser bundle during the image build**.
  Edit them and restart, and nothing changes — you must rebuild. They are
  public by definition; never paste a secret into one.
- Everything else (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) is read by the Node process at runtime, so a
  `docker compose restart app` is enough.

The Supabase project settings are in the Lovable/Supabase dashboard: URL plus the
`publishable` key for the browser, and the `secret`/service-role key for
`SUPABASE_SERVICE_ROLE_KEY` (server only — it bypasses row-level security).

`DATA_DIR` is also runtime-only and already set to `/data` in the image, which the
`eqr-data` volume mounts. Leave it alone unless you run the app without Docker
(section 8) or bind-mount a different path.

## 4. Build and start

`--env-file .env.server` makes Compose read your build-time values from that file
instead of the repo's `.env`; you can also just export them in the shell.

```bash
docker compose --env-file .env.server build    # ~1–3 min first time
docker compose --env-file .env.server up -d
docker compose ps                              # app (healthy), web running
```

## 5. Verify

```bash
curl -sI http://localhost/ | head -3               # 200, server: nginx
curl -sI http://localhost/sw.js | grep -i content-length
curl -s  http://localhost/ | grep -o '<title>[^<]*'  # SSR HTML from the app
docker compose logs --tail=50 app                   # "Listening on: http://..."
```

The `sw.js` check is the one worth reading carefully: its `Content-Length` must
equal the byte size of `.output/public/sw.js` inside the `web` image. A smaller
value means the request was answered by Node instead of nginx (see the note up
top), and the PWA will not install.

In a desktop browser, open DevTools → Application → Service Workers and confirm
the worker shows *Status: activated* with a precache cache listed, then check that
the address bar offers an install icon.

Then log in and run one attendance loop end to end: teacher starts a session, a
second device scans the rotating QR and taps *Mark Attendance*, the name appears in
the live list, the teacher stops the session and *Download PDF* saves a real `.pdf`
that lists every enrolled student as Present or Absent.

## 6. HTTPS (required before phones will install the PWA)

Browsers only offer "Add to Home Screen" over HTTPS, so do this before
distributing the app.

```bash
docker compose run --rm certbot certonly --webroot \
    -w /var/www/certbot -d eqr.example.edu
```

Then edit `deploy/nginx/conf.d/eqr.conf` (that file is baked into the `web`
image, so a rebuild is part of the change): uncomment `server_name`, the two
`listen 443` lines, `http2 on` and the two certificate paths, adjusting the
hostname in the paths.

```bash
docker compose --env-file .env.server build web
docker compose up -d web
curl -sI https://eqr.example.edu/ | head -3
```

Renewal (certbot certs last 90 days) — a cron entry on the host:

```
0 3 * * 1  cd /srv/campus-erp && docker compose run --rm certbot renew --quiet && docker compose restart web
```

## 7. Updating and rolling back

```bash
cd /srv/campus-erp
docker tag campus-erp:latest campus-erp:previous   # keep a rollback target
git pull
docker compose --env-file .env.server build        # app and web
docker compose --env-file .env.server up -d
```

Roll back:

```bash
docker tag campus-erp:previous campus-erp:latest && docker compose up -d app
```

Because `sw.js` and the manifest are served with `no-cache` (see `eqr.conf`) and
`registerType: autoUpdate`, clients pick up the new build on their next load —
no manual app update step for students.

## 8. No-Docker alternative

Same artifact, run under a process manager:

```bash
npm ci
NITRO_PRESET=node_server npm run build    # preset switch = Node server, not Cloudflare
PORT=3000 DATA_DIR=/srv/campus-erp/data node .output/server/index.mjs   # supervise with systemd/pm2
```

Without `DATA_DIR` the store lands in `.data/` next to the working directory, which
a rebuild or `git clean` can wipe.

Point nginx at both pieces — static files from disk, everything else to :3000:

```nginx
root /srv/campus-erp/.output/public;
location /assets/ { expires 1y; try_files $uri @app; }
location = /sw.js { expires -1; try_files $uri @app; }
location = /manifest.webmanifest { expires -1; try_files $uri @app; }
location / { proxy_pass http://127.0.0.1:3000; }
```

Serving `sw.js` from disk is not optional here: the Node server would answer it
with a stale `Content-Length` and browsers would reject the truncated worker.

## 9. Attendance data: where it lives, backups, and the single-writer rule

QR attendance is written server-side to `DATA_DIR/attendance.json` (in Docker that
is the `eqr-data` named volume, mounted at `/data`). Sessions, scans and class
rosters all go through one serialized writer; the process also caches the file in
memory for its lifetime, so it never re-reads another process's writes.

**Run exactly one `app` process.** Two Node servers — two containers, two replicas,
a systemd unit plus a manual `node .output/server/index.mjs` — each keep their own
cached snapshot and overwrite the file on the next write, silently dropping the
other's attendance. Scale by adding read-only clients, not app instances.

Backups:

```bash
docker compose --env-file .env.server exec app sh -c 'cp /data/attendance.json /data/attendance.$(date +%F).bak'
docker run --rm -v campus-erp_eqr-data:/d -v "$PWD":/out alpine cp /d/attendance.json /out/attendance.$(date +%F).json
```

The file is small (a few KB per class per day) and human-readable; the atomic
temp-write + rename means a `.json` copy is always a consistent snapshot.

### Mirroring to Supabase (optional but recommended)

The JSON store is the source of truth for the running app; Supabase gets a mirror so
the data survives the container and can be queried by other tools. It is active only
when all three hold:

1. `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.server`, together with `SUPABASE_URL`
   (or `VITE_SUPABASE_URL`) — runtime values, so a restart is enough, no rebuild.
   Any value still containing the word `placeholder` is treated as unset.
2. The mirror tables exist: apply
   `supabase/migrations/20260930090000_attendance_mirror_tables.sql` through the
   Supabase CLI or the dashboard SQL editor. It creates the `erp_attendance_sessions`,
   `erp_attendance_records` and `erp_attendance_roster` tables.
3. The service-role key keeps its server-only placement. It bypasses row-level
   security; putting it in any `VITE_*` variable ships it inside publicly
   downloadable JavaScript.

Mirroring is best-effort and non-blocking: if Supabase is unreachable the scan still
succeeds and stays in `/data`, and the failure is logged as
`[attendance mirror] upsert into <table> failed`. So a Supabase outage is never a
reason attendance disappears.

Everything else is still hosted: generated report files in Appwrite storage,
users and logins in Clerk. Schema history lives in `supabase/migrations/` — apply
through the Supabase CLI or the SQL editor, never from the container.

## 10. Security checklist before going public

- [ ] Revoke the Appwrite API key that used to be hardcoded in
      `src/integrations/appwrite/client.ts`. The line is gone from the code, but the
      key is still in git history and the repo is public, so treat that key as leaked
      and delete it in the Appwrite console. Until a replacement is saved in
      Settings → Appwrite Database & Storage, report uploads simply stay on the
      device (`[Appwrite] Not configured — report saved to device only.`) and
      attendance is unaffected.
- [ ] `.env` is committed in this repo (Clerk publishable key). Publishable keys
      are browser-visible by design, but confirm it is the test key you intend to
      ship; anything else must leave git history.
- [ ] Set the Clerk *allowed origins / redirect settings* to the real hostname.
- [ ] Supabase RLS policies verified with a non-service-role account before real
      student data goes in.
- [ ] `chmod 600 .env.server`, and never add secrets to a `VITE_*` variable.

## 11. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Every page returns 500, log shows `@clerk/clerk-react: The publishableKey ... is invalid` | A bad `VITE_CLERK_PUBLISHABLE_KEY` was baked in at build time and SSR dies on it. Set the correct key and rebuild — a restart is not enough. |
| PWA never offers "Install app", DevTools shows the worker as redundant | The response was served by Node with the stale `Content-Length`. Check `curl -sI http://<host>/sw.js` against the file size in `.output/public/sw.js`, and confirm the `web` container is the one answering. |
| Browser still shows the old UI after a deploy | Hard-reload once. After that the `no-cache` worker rules take over; `?sw=off` is the built-in kill switch in `src/lib/pwa.ts`. |
| Data pages load but write nothing to Supabase | `SUPABASE_URL` / keys missing from `.env.server`, and the app fell back to its local-storage mode (`[Campus ERP] Running in Local Storage Mode` in the browser console). |
| Scan succeeds but the name never appears in the attendance list | The Node process cannot write `DATA_DIR` (permission or disk full) — `docker compose logs app` shows `[attendance store] write failed`. The container expects `/data` owned by the app's non-root user. |
| Marks vanish, or one teacher's sessions are invisible to another | Two `app` processes are sharing one `/data` (see section 9). Keep a single writer. |
| "This QR code has expired. Scan the live code again." on a valid code | The QR tick is the server's clock, with 20 s of tolerance. A phone whose clock is minutes off will always fail; fix the device clock, not the app. |
| *Mark Attendance* reports a failure for a student who is clearly in class | Their personal code or roll was typed with the wrong case/spaces, or the roster has no matching roll. The review step shows the exact payload before it is sent. |
| *Download PDF* appears to do nothing in the installed PWA | Should no longer happen — the print-popup path was replaced by a real file save. If it recurs, check the browser console for `[attendance] pdf generation failed:`. |

## 12. Known limitation: full-offline shell

`web` precaches the JS/CSS/icons (32 entries in a current build), but the app has
no prerendered `index.html` — every route is server-rendered — so Workbox's
`navigateFallback: "/"` has nothing to serve. Offline therefore covers installed
launch of cached assets, not cold-starting a page with no network. Fixing that
needs either a prerender step or `strategies: "injectManifest"` with a hand
written fallback; it is out of scope for the server install.

## 13. What was verified before shipping these files

Checked on Windows against the real build, following the Dockerfile's steps
manually (no Docker engine on that machine, so `docker build` itself was **not**
run, and the nginx config has not been parsed by a live nginx):

- `npm ci` → `NITRO_PRESET=node_server npm run build` → `node .output/server/index.mjs`
  exits clean; `/`, `/dashboard`, `/timetable`, `/manifest.webmanifest`,
  `/favicon.png` → 200, unknown route → 404.
- `VITE_*` build args reach the browser bundle (verified by grepping the emitted
  chunk for a probe URL) and empty ones are skipped so the committed `.env` still
  applies.
- The generated `sw.js` registers and activates in Chrome and precaches 32
  responses when served from disk; served through Node it came back truncated,
  which is why the web tier exists.
- `docker-compose.yml` parses as YAML; `Dockerfile` stages follow the same
  commands that were run by hand.

## 14. What was verified for the QR attendance fix

Same machine, same method: real `NITRO_PRESET=node_server` build, then the shipped
server functions driven over HTTP against `node .output/server/index.mjs` with a
clean `DATA_DIR` — 55 checks, all passing.

- Teacher opens a session: id and signing secret are generated server-side and the
  session survives a page reload (`getActiveSessionForTeacher`).
- A live rotating QR marks attendance for real: status `Present`, source `live_qr`,
  the row appears in `listAttendance`, and it is still there after the session is
  stopped.
- Honest rejections: a stale tick → `expired_token`, a forged signature →
  `invalid_token` with **no** row written, a scan after stop → `session_ended`, a
  rescan → `alreadyMarked` with the present count unchanged.
- A teacher scanning a student's personal code marks *that student*, and the name is
  completed from the roster — the teacher's own name no longer lands on the sheet.
- Manual roll entries and roll-number approvals match the roster and show up in the
  student's own history (`listStudentMarks`).
- The report after stop contains every enrolled student, roll-sorted, as Present or
  Absent, with no scan time on absent rows.
- The PDF is a real file: `%PDF` magic, `%%EOF` trailer, page objects matching the
  reported page count, and every student's name and roll number inside it.
- Everything above was re-read from `DATA_DIR/attendance.json` on disk.
- `npx tsc --noEmit` is clean. The `exactOptionalPropertyTypes` errors that section
  13 used to call "pre-existing" were part of this work and are fixed.
- `npm run lint` still reports CRLF/prettier noise repo-wide, including untouched
  files: the working copy is checked out with `core.autocrlf=true`. The files changed
  here were normalised with `npx prettier --write`.

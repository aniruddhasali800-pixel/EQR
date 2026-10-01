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
scans and class rosters are written server-side, into Supabase when that project is
configured and reachable and otherwise into `DATA_DIR` (default `/data`) as JSON.
See section 9 — it also covers why a serverless host (Vercel) has to use Supabase.

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

An open tab keeps running the bundle it loaded, so `src/lib/pwa.ts` now re-checks
`sw.js` every five minutes and reloads the page once a newer worker takes control.
That is what stops a projector left open across a deploy from minting QR codes the
new server cannot read. Hosts that cannot serve `/sw.js` get the same protection a
different way: the build bakes its commit id into both bundles, `getSessionStatus`
returns the server's, and the teacher page reloads onto it — see section 11. The QR
card also prints the host that will verify the codes, so a teacher can see at a
glance whether the class is scanning against the same server.

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

## 9. Attendance data: which store the server picks

`src/lib/attendance-store.server.ts` chooses a backend **once per process** (first
`storeHealth()` call) and then keeps it, so a flaky database can never move a live
lecture between two stores. The order is:

| Order | Backend | Chosen when | Where the rows live |
| --- | --- | --- | --- |
| 1 | `supabase` | `SUPABASE_URL` + a service-role key are set **and** a real read of `erp_attendance_sessions` succeeds | Supabase `erp_attendance_*` tables |
| 2 | `file` | The database is absent or unhealthy and `DATA_DIR` is writable | `DATA_DIR/attendance.json` (`/data` in Docker) |
| 3 | `none` | Neither works | Nothing — the server **refuses to open a session** |

`none` is deliberate. A projected QR that cannot record anything costs a whole class
period; a red banner on the teacher's screen costs a restart. With no usable store,
*Start live QR* shows the exact gap ("…no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
configured, and the server cannot write /data (EROFS)…"), and the same text comes
back from the `getAttendanceHealth` server function, which the teacher page also
re-checks on window focus.

### Serverless hosts (Vercel and friends): Supabase is mandatory

Do not deploy attendance to a host that gives you no writable, shared disk. Vercel
unpacks the build into a read-only code directory and each instance gets its own
ephemeral `/tmp`, so the JSON file is one cold start's private cache — two devices
(or two requests routed to two instances) never see the same session, which is
exactly where "I scanned but nothing was marked" came from. Only two backend-1
variables make it work:

1. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — project settings → Environment
   Variables, for the **Production** (and Preview) environments, then redeploy.
   Runtime values: no rebuild of the browser bundle is needed.
2. The tables — paste
   `supabase/migrations/20260930090000_attendance_mirror_tables.sql` into the
   Supabase dashboard's SQL editor and run it once. It creates
   `erp_attendance_sessions` (including the `secret` column the QR is signed with),
   `erp_attendance_records` and `erp_attendance_roster`, turns RLS on, and grants
   them to `service_role` only. An existing database is upgraded in place: the file
   is idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

Without step 2 the health probe fails, the store reports `none`, and the teacher sees
a message naming that migration file instead of a silently dead QR. Read the
deployment's env list before assuming this is configured: a project that still shows
a URL or key containing `placeholder` is treated as unset.

Because Supabase is shared, one serverless deployment can run many instances safely —
that is the backend to use when you cannot control the filesystem.

### File backend: the single-writer rule and backups

Sessions, scans and rosters go through one serialized writer, and the process caches
the file in memory for its lifetime, so it never re-reads another process's writes.

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
temp-write + rename means a `.json` copy is always a consistent snapshot. A store
that cannot complete its disk write returns `null` rather than pretending the scan
was saved.

### Mirroring the file store into Supabase (optional)

When the live backend is `file` *and* Supabase credentials are present, every
session/record/roster write is additionally upserted into the same `erp_*` tables,
best-effort and off the response path: a mirror failure logs
`[attendance mirror] upsert into <table> failed` and the scan still succeeds, so a
Supabase outage never eats attendance. When the credentials are healthy the store
skips this entirely and uses Supabase as the source of truth (backend 1).

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
| *Start live QR* does nothing and the toast/banner says "Attendance cannot be recorded…" | The picked backend is `none` (section 9): no usable database **and** no writable disk. On Vercel the disk is always unwritable, so add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to the project's environment and apply the `erp_attendance_*` migration — the banner text names whichever of the two is missing. |
| Every page returns 500, log shows `@clerk/clerk-react: The publishableKey ... is invalid` | A bad `VITE_CLERK_PUBLISHABLE_KEY` was baked in at build time and SSR dies on it. Set the correct key and rebuild — a restart is not enough. |
| PWA never offers "Install app", DevTools shows the worker as redundant | The response was served by Node with the stale `Content-Length`. Check `curl -sI http://<host>/sw.js` against the file size in `.output/public/sw.js`, and confirm the `web` container is the one answering. |
| Browser still shows the old UI after a deploy | Two independent mechanisms fix this: the service worker reloads a long-open tab once the new build takes control, and — if the host cannot serve `/sw.js` at all — the teacher page compares its own baked-in commit id against the one `getSessionStatus` reports and reloads onto the server's build. Hard-reload to force it; `?sw=off` is the kill switch if the worker itself is the problem. |
| Student scans and gets "This attendance session is not on the server", and the QR preview shows a `sess_…` id | The teacher's screen is an old cached bundle drawing QRs from a build that kept sessions in its own `localStorage`; the server has never seen that session id. Reload the teacher's device (hard refresh, or close and reopen the installed app) and start the session again. Both devices must run the same build for a scan to land. |
| Scan says the session is not on the server even for a *fresh* QR, on Vercel | The file store is per-instance and ephemeral there, so the next request may hit a different cold instance. Point the deployment at Supabase (section 9); no amount of reloading fixes a store that only one instance can see. |
| Mark Attendance returns "This session was created before the server stored its signing key" | A session opened by an older build has no `secret` column value. Stop it and start a new one; new sessions carry the secret and verify server-side. |
| A `sess_…` QR survives a reload of the teacher's screen | The host is serving an old bundle, not the device. Check `curl -s https://<host>/attendance \| grep -o 'assets/index-[^"]*'` against `.output/public/assets/` in the build, and `curl -sI https://<host>/sw.js` — a 404 there means the deploy never ships the generated service worker, so nothing can update a client that is already installed. The in-app build check still reloads the teacher's tab; fix the host so phones installing the PWA can update too. |
| Teacher's QR vanishes with "The server no longer hosts this session. Start it again before students scan." | The server restarted, or its data directory was wiped/reset — the session genuinely is not there any more. Start it again; the teacher page now polls every five seconds instead of projecting a QR no student can use. |
| Teacher's QR vanishes with "This session has been stopped…" | Another device (or another tab) stopped that session. The QR on screen is finished; start a new session for the next batch. |
| Data pages load but write nothing to Supabase | `SUPABASE_URL` / keys missing from `.env.server`, and the app fell back to its local-storage mode (`[Campus ERP] Running in Local Storage Mode` in the browser console). |
| Scan succeeds but the name never appears in the attendance list | The Node process cannot write `DATA_DIR` (permission or disk full) — `docker compose logs app` shows `[attendance store] write failed`. The container expects `/data` owned by the app's non-root user. |
| Teacher's page says attendance is stored in a file "not in Supabase — …" | Supabase is configured but unhealthy, so the store fell back to the file. The rest of that sentence is the database's own error: a missing table names the migration file, `permission denied` means the key is not the service-role one. |
| Marks vanish, or one teacher's sessions are invisible to another | Two `app` processes are sharing one `/data` (see section 9). Keep a single writer. Or the deployment is serverless and still on the file backend — switch to Supabase. |
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
clean `DATA_DIR` — 55 checks on the file store, all passing.

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

### Follow-up round: keeping the teacher's QR honest

The next build added a `getSessionStatus` server function and a poll on the teacher
page, so an unusable QR is never projected. Re-run of the same method on the new
`node_server` artifact — 15 checks, all passing:

- `getSessionStatus` answers `{ exists, isActive, buildId }`: `exists/isActive` true
  while the teacher hosts the session, `exists: true, isActive: false` after it is
  stopped, and `exists: false` for a session id the server never had. Those three
  cases are what the teacher page now distinguishes, so a stopped session says
  "this session has been stopped" instead of blaming the server.
- The `buildId` the endpoint reports is the same commit id baked into the shipped
  client bundle, which is what lets a stale tab notice and reload itself — including
  on a host that serves no `/sw.js` at all.
- A session id minted by the old browser-only build (`sess_…`) is still rejected, and
  the rejection text names the reload the teacher has to do.
- Live scan → `Present`, rescan deduped, forged signature rejected with no row, late
  scan after stop → `session_ended`, and the stopped report still lists the full
  roster as Present/Absent. Re-read from `DATA_DIR/attendance.json` afterwards.
- Every page (`/`, `/auth`, `/attendance`, `/dashboard`, `/settings`, `/sw.js`,
  `/manifest.webmanifest`) returns 200 from the built server.

### Round: Supabase as the store, for hosts with no disk

The teacher-side failure on `eqr-five.vercel.app` / `eqr.imp.mom` was infrastructure,
not UI: both deployments served the newest bundle but carried no Supabase
environment (their browser chunks still contained only the committed placeholder URL and
key), so the store was the JSON file — and a Vercel instance cannot keep one.
*Start live QR* therefore returned "The server could not open the session."

The same HTTP method was re-run against a `node_server` build, 55 checks, all
passing. The Supabase backend was driven against a local PostgREST stand-in that
implements the exact endpoints, filters and `Prefer` headers `@supabase/postgrest-js`
2.112.2 sends — so it validates this code's queries, not Supabase's own uptime:

- File backend (22 checks): the whole scan loop plus every row re-read from
  `attendance.json` on disk.
- Supabase backend (24 checks): the same loop through `erp_attendance_*`, and the
  point of the exercise — **two separate Node processes** reading that database saw
  the same session and the same mark, which the file store cannot promise.
- No credentials and no writable disk → backend `none`, the server refuses to open a
  session, and the message names both gaps and the fix.
- Credentials but no tables → backend `none`, and the text names
  `supabase/migrations/20260930090000_attendance_mirror_tables.sql`.
- Unhealthy database, writable disk → falls back to `file` and says so, rather than
  silently storing attendance somewhere the school cannot query.

Two real bugs surfaced only because the queries were executed instead of eyeballed:

- `openSession` handed back the whole result *array* as if it were one row, so the
  session reached the client with an empty signing secret — every scan from that QR
  would have failed verification.
- The health probe was a head-count, and `postgrest-js` turns a `404` with an empty
  body into `204 / no error`, so a missing table looked healthy and the store would
  have declared Supabase usable. It now runs a real `select("id").limit(1)`.

`npx tsc --noEmit` clean, eslint clean on the changed files, and
`NITRO_PRESET=node_server npm run build` exit 0 for the artifact above. That artifact
was then smoke-tested as it will actually run (19 checks, all passing): a real
`node .output/server/index.mjs` on a clean `DATA_DIR`, called through the shipped
`/_serverFn/<id>` wire protocol — health reports the file store, a session comes back
with a signing secret, a live rotating QR marks `Present`, a forged signature and a
post-stop scan are both refused with no row written, a rescan dedupes, the report and
`attendance.json` on disk contain the scan — and a second instance started with an
unwritable `DATA_DIR` plus placeholder credentials reports backend `none`, names
`SUPABASE_URL` and the migration file, and refuses to open a session at all.

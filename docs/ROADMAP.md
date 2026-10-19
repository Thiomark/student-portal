# Roadmap

What exists now, what comes next, and the plan for the larger ideas. Each
phase is meant to be usable on its own.

## Phase 1: foundation (this branch)

- Multi-tenant schools, Clerk sign-in, roles and per-person permissions, staff
  invites.
- Learners, parents/guardians (many-to-many, contact capabilities per number),
  classes, grades, academic years and subjects.
- Textbooks: titles, numbered copies (bulk ranges), an **offline** issue/return
  desk with condition tracking, loans, overdue, lost and damaged.
- Parent meetings with WhatsApp/email notification and an office queue for
  calls and printed letters. Broadcast messages to a class, grade or the whole
  school.
- Learner incidents (teachers report, parents notified), school trips (grades,
  consent, payments with reversals, balances) and maintenance requests.
- Activity log for every change. Parent portal (read-only).
- Installable PWA.

## Phase 2: next up

- **Attendance**: daily register per class, offline like the desk. Absence
  alerts to parents via the existing notify pipeline.
- **WhatsApp replies**: Whaple has no webhooks today, so poll message status
  and record delivered/read on `messages`. Let staff log a parent's reply
  (confirm/decline a meeting) in one tap.
- **SMS provider** (e.g. BulkSMS or Clickatell) so `sms` routes send
  automatically instead of becoming office to-dos.
- **Year-end rollover**: promote classes to the next grade and carry
  outstanding textbook loans into the new year.
- **CSV import** of learners and parents from SA-SAMS exports.
- **Parent portal actions**: confirm meetings, give trip consent, update
  contact details (as a request staff approve).
- Move more modules to the offline outbox (incidents, trip payments), reusing
  `src/lib/offline/*` and `/api/s/[school]/sync`.

## Phase 3: apps

The web app is the product; native shells wrap it rather than rewriting it.

- **Android**: start as an installable PWA. Ship a Trusted Web Activity
  through Play Store if schools need an app listing. Capacitor is the option if
  barcode scanning with the camera or background sync needs native APIs.
- **Windows desktop**: a Tauri shell (small, around 10 MB, uses the system
  WebView2) that loads the hosted app. It adds a local print agent (below) and
  keeps the service worker cache. Avoid Electron: its size and memory use hurt
  old laptops.
- Both keep data in IndexedDB the same way, so offline behaviour is identical.

## Phase 4: printing and cameras (plan only)

### Printer usage tracking

The goal is to see who prints what and how much, and to deter misuse. Three
levels, from simplest to most work:

1. **Manual log** (no integration). A "Print job" form records staff member,
   pages, colour/mono, purpose and class. A monthly report per teacher with
   per-person quotas. Cheap, and works today on any printer.
2. **Print server import.** Most schools print through a Windows print server
   or the copier's own accounting. Import its job log (Windows `PrintService`
   event log ID 307, or the copier's CSV export of department codes / PIN
   jobs). Map department codes to staff, then show usage, quotas and anomalies
   (e.g. 300 pages at 22:00).
3. **Print agent.** The Tauri desktop app (or a small Windows service) watches
   the local spooler and posts job metadata (user, document name, pages,
   printer) to `/api/s/[school]/print-jobs`. It never sends document contents.

Tables when we build it: `printers(id, school_id, name, location, model,
counter_source)`, `print_jobs(id, school_id, printer_id, staff_id, pages,
colour, document_name, source, printed_at)` and
`print_quotas(staff_id, period, pages)`.

### Cameras

Store an inventory and links only; never stream video through our servers.

- `cameras(id, school_id, name, location, kind, nvr, stream_url (encrypted),
  status, last_seen_at)` with maintenance requests linkable to a camera.
- Most school CCTV is an NVR on the local network. "Open live view" links to
  the NVR web UI or an RTSP URL the browser/desktop app opens locally.
- Health checks (is the NVR reachable, are cameras offline) can come from the
  desktop agent on the school network, reported to `last_seen_at`. Alerts go
  to facilities through the maintenance module.
- Footage requests (e.g. for an incident) are tracked as a workflow linked to
  the incident, with who viewed what in the activity log.

## Open questions for the schools

- Which learner fields does SA-SAMS export, and do they want us to sync with it?
- Do parents pay trip money mostly by cash or EFT? If EFT, do they want
  bank-statement import?
- Should teachers see all incidents, or only for their own classes?
- For printing, which copier brands and is there a print server?

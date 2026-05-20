# Discord Event Bot

A production-quality bot for managing competitive creative events (map building, coding, art, writing, build jams) on Discord.

---

## Folder Structure

```
commands/
  events/
    setup.js    # /event-setup
    status.js   # /event-status
    delete.js   # /event-delete
    seed.js     # /event-seed (dev only)
handlers/
  commandHandler.js
  buttonHandler.js
  modalHandler.js
events/
  ready.js
  interactionCreate.js
utils/
  helpers.js
db.js
index.js
deploy-commands.js
.env          <- create this (see below)
.env.example
package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

Copy `.env.example` to `.env` and fill it in:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_server_guild_id
JUDGE_ROLE_ID=role_id_for_judges
ADMIN_ROLE_ID=role_id_for_admins
```

**Never commit `.env` to git.** Add it to `.gitignore`.

### 3. Bot permissions required

When inviting the bot, ensure it has:
- `bot` scope + `applications.commands` scope
- Permissions: `Manage Channels`, `Manage Threads`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `View Channels`

### 4. Deploy slash commands

```bash
npm run deploy
```

### 5. Start the bot

```bash
npm start
```

---

## Event Lifecycle

```
/event-setup name:"Escape Room Competition"
 v
 Channels auto-created
 v
 Users click "Submit Entry" -> Modal -> Private thread created
 v
 Admin clicks "Start Judging" button in #judging
 v
 Threads lock, judges score via the judging panel
 v
 Admin clicks "Reveal Results" button
 v
 Threads go public
 v
 Admin clicks "Archive Event" button -> results posted to #results
```

---

## Commands

| Command | Description | Permission |
|---|---|---|
| `/event-setup` | Create a new event + all channels | Admin |
| `/event-status` | View event stats and phase | Admin |
| `/event-delete` | Delete an event and all its data | Admin |
| `/event-seed` | Seed 1–25 fake test submissions | Admin (dev) |

---

## File Uploads

Discord modals do not allow file upload

1. User clicks **Submit Entry** and fills out the modal
2. A private thread is created immediately
3. User uploads files directly into the thread
4. Judges can see only after judging phase. Admins can see always.

---

## Thread Privacy

- Submission threads are **private** - only visible to the submitter, and admin role
- Threads are **locked** when judging starts (no more edits); judges can see it
- Threads become **public** after `/event-reveal`

---

## Database

SQLite with WAL mode. The `events.db` file is created automatically on first run.

Tables: `events`, `submissions`, `scores`, `votes`

---

---

## Functionality

### Slash Commands

- [x] `/event-setup` — opens modal (name, description, deadline), creates all channels and judge hub
- [x] `/event-status` — shows event status embed (status, entries, scored, pending, deadline)
- [x] `/event-delete` — triggers two-step deletion confirmation flow
- [x] `/event-seed` — seeds 1–25 fake test submissions (dev use)

### Event Setup Modal
- [x] Creates category, #submit, #judging, #results channels with correct permission overwrites
- [x] Posts submission embed + buttons in #submit
- [x] Posts template announcement message in #submit
- [x] Creates judge hub in #judging
- [x] Stores event in DB with deadline timestamp

### Submission Flow
- [x] Submit button checks submissions are open
- [x] Duplicate submission guard (one per user per event)
- [x] Opens submission modal (title, description)
- [x] Creates private thread, adds submitter + all admins
- [x] Stores submission in DB, posts confirmation embed in thread
- [x] Refreshes judge hub live

### Judge Hub
- [x] Live embed with all entries, scoring status per entry (⬜ 🟡 🟢)
- [ ] Pagination (20 entries/page, prev/net buttons)
- [x] My Progress button — ephemeral per-judge checklist
- [x] Phase transition button (context-aware per current status)
- [x] Delete Event button

### Judging Flow
- [x] View Entry button — shows entry detail embed with score/feedback
- [x] Score button — opens score modal, pre-fills eisting score
- [x] Score modal validates 1–10, prevents self-scoring, upserts score
- [x] Judge hub average updates after every score

### Phase Transitions (admin only)
- [x] `submissions_open → judging` — locks threads, adds judges, pings judges in #judging
- [x] `judging → revealed` — unlocks threads, makes them public read-only
- [x] `revealed → archived` — posts ranked results in #results, locks/archives all threads

### Results Archive
- [x] Header embed posted in #results
- [x] All entries posted lowest→highest (1st place at bottom)
- [x] Each result shows rank, creator ping, category, score, description, feedback
- [x] Thread link button on each result

### Event Deletion
- [x] Step 1 — shows submission count, asks for confirmation
- [x] Step 2 — deletes threads, channels, category, all DB records
- [ ] Replies before deleting #judging to avoid interaction error

### Event Status Button
- [x] Shows ephemeral status card (status badge, entries, deadline) — available to all users

### Permissions
- [x] Admin check (Administrator perm or `ADMIN_ROLE_ID`) on all admin actions
- [x] Judge check (Administrator, `JUDGE_ROLE_ID`, or `ADMIN_ROLE_ID`) on judge actions
- [x] Bot has explicit SendMessages overwrite in all event channels

### Infrastructure
- [x] Cooldown system (3s default per user per command)
- [x] Error reply on failed command (no cascade crash)
- [x] Dynamic command + event loader on startup
- [x] SQLite WAL mode, foreign keys enforced
- [x] `npm run deploy` registers new commands to guild

# SBnM-bot

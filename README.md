# Discord Event Bot

A production-quality bot for managing competitive creative events (map building, coding, art, writing, build jams) on Discord.

---

## Folder Structure

```
bot/
 commands/
    events/
      setup.js # /event-setup
      status.js # /event-status
      delete.js # /event-delete
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
 .env <- create this (see below)
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

- Rotate your bot token if it's ever exposed

---

## Functionality Tests

### Slash Commands
- [ ] `/event-setup` — opens modal (name, description, deadline), creates all channels and judge hub
- [ ] `/event-status` — shows event status embed (status, entries, scored, pending, deadline)
- [ ] `/event-delete` — triggers two-step deletion confirmation flow
- [ ] `/event-seed` — seeds 1–25 fake test submissions (dev use)

### Event Setup Modal
- [ ] Creates category, #submit, #judging, #results channels with correct permission overwrites
- [ ] Posts submission embed + buttons in #submit
- [ ] Posts template announcement message in #submit
- [ ] Creates and pins judge hub in #judging
- [ ] Stores event in DB with deadline timestamp

### Submission Flow
- [ ] Submit button checks submissions are open
- [ ] Duplicate submission guard (one per user per event)
- [ ] Opens submission modal (title, description)
- [ ] Creates private thread, adds submitter + all admins
- [ ] Stores submission in DB, posts confirmation embed in thread
- [ ] Refreshes judge hub live

### Judge Hub
- [ ] Live embed with all entries, scoring status per entry (⬜ 🟡 🟢)
- [ ] Pagination (20 entries/page, prev/next buttons)
- [ ] My Progress button — ephemeral per-judge checklist
- [ ] Phase transition button (context-aware per current status)
- [ ] Delete Event button

### Judging Flow
- [ ] View Entry button — shows entry detail embed with score/feedback
- [ ] Score button — opens score modal, pre-fills existing score
- [ ] Score modal validates 1–10, prevents self-scoring, upserts score
- [ ] Judge hub average updates after every score

### Phase Transitions (admin only)
- [ ] `submissions_open → judging` — locks threads, adds judges, pings judges in #judging
- [ ] `judging → revealed` — unlocks threads, makes them public read-only
- [ ] `revealed → archived` — posts ranked results in #results, locks/archives all threads

### Results Archive
- [ ] Header embed posted in #results
- [ ] All entries posted lowest→highest (1st place at bottom)
- [ ] Each result shows rank, creator ping, category, score, description, feedback
- [ ] Thread link button on each result

### Event Deletion
- [ ] Step 1 — shows submission count, asks for confirmation
- [ ] Step 2 — deletes threads, channels, category, all DB records
- [ ] Replies before deleting #judging to avoid interaction error

### Event Status Button
- [ ] Shows ephemeral status card (status badge, entries, deadline) — available to all users

### Permissions
- [ ] Admin check (Administrator perm or `ADMIN_ROLE_ID`) on all admin actions
- [ ] Judge check (Administrator, `JUDGE_ROLE_ID`, or `ADMIN_ROLE_ID`) on judge actions
- [ ] Bot has explicit SendMessages overwrite in all event channels

### Infrastructure
- [ ] Cooldown system (3s default per user per command)
- [ ] Error reply on failed command (no cascade crash)
- [ ] Dynamic command + event loader on startup
- [ ] SQLite WAL mode, foreign keys enforced
- [ ] `npm run deploy` registers commands to guild

# SBnM-bot

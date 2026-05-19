# Sit back and minecraft bot

A Discord bot for running competitions. Participants submit entries, judges score them anonymously during a judging phase, then results are revealed publicly.

---

## The big picture

```
index.js  ←  boots the bot, loads everything
    │
    ├── events/ready.js          fires once when the bot connects
    ├── events/interactionCreate.js  fires on every user action
    │       │
    │       ├── handlers/commandHandler.js   /slash commands
    │       ├── handlers/buttonHandler.js    button clicks
    │       └── handlers/modalHandler.js     form submissions
    │
    ├── commands/events/
    │       ├── setup.js    /event-setup
    │       ├── status.js   /event-status
    │       └── delete.js   /event-delete
    │
    ├── utils/helpers.js    shared functions (embeds, thread perms, etc.)
    └── db.js               SQLite database + all prepared statements
```

---

## Files

### `index.js`
The entry point. It:
- Creates the Discord client with the permissions it needs (read messages, see members, etc.)
- Scans the `commands/` folder and loads every command into a `client.commands` map
- Scans the `events/` folder and registers each event listener
- Logs in using the token from `.env`

You never need to touch this unless you're adding a new top-level feature.

---

### `deploy-commands.js`
A one-off script you run manually (`node deploy-commands.js`) whenever you add or rename a slash command. It reads all the command definitions and registers them with Discord's API for your specific server. Has nothing to do with the running bot — it's just for syncing slash commands.

---

### `db.js`
Sets up the SQLite database (`events.db`) and exports every prepared SQL statement the rest of the bot uses.

**Tables:**
- `events` — one row per competition (name, status, channel IDs, etc.)
- `submissions` — one row per entry (linked to an event, has a thread ID and a codename)
- `scores` — one row per judge-per-entry score (1–10 + optional feedback)
- `votes` — for public voting (schema and prepared statements exist, but no UI or handlers use it yet)

**Event statuses** (in order):
1. `submissions_open` — people can submit
2. `judging` — judges can see and score threads
3. `revealed` — threads go public, scores are visible
4. `archived` — results posted to the results channel, threads locked

All the SQL lives here. If you ever need a new query, add a prepared statement here and use it from whichever handler needs it.

---

### `events/ready.js`
Runs once when the bot successfully connects to Discord. Sets the bot's status to "Watching competitive events" and logs a confirmation to the console.

---

### `events/interactionCreate.js`
Runs every time a user does anything interactive (types a slash command, clicks a button, submits a modal form). It figures out what type of interaction it is and routes it to the right handler. Also catches any unhandled errors so they don't crash the bot.

---

### `handlers/commandHandler.js`
Handles slash commands. It:
- Looks up the command by name
- Enforces a cooldown (default 3 seconds per user per command) so people can't spam
- Calls the command's `execute()` function
- If something goes wrong, sends an ephemeral error message to the user

---

### `handlers/modalHandler.js`
Handles the two popup forms in the bot.

**Submission form** (`modal_submit_*`): When someone clicks "Submit an Entry" and fills in the title + description, this:
1. Checks submissions are still open and the user hasn't already submitted
2. Creates a private thread in the submission channel — only the submitter and admins can see it at this point. Judges are deliberately NOT added here; they only get access when judging starts.
3. Stores the entry with the title as its codename, defaulting category to `General` and link to `null`
4. Posts a confirmation embed inside the thread with upload instructions
5. Refreshes the judging panel so the new entry appears

**Score form** (`modal_score_*`): When a judge submits a score through the judging panel, this saves the 1–10 score and optional feedback to the database, then refreshes the panel so averages update live.

---

### `handlers/buttonHandler.js`
The busiest file. Handles every button click in the bot. Buttons are identified by their `customId`.

**`event_submit_*`** — Opens the submission modal when someone clicks "Submit an Entry".

**`event_status_*`** — Shows an ephemeral card with the event's current phase and entry count.

**`phase_*`** — Phase transition buttons in the judging panel (admin only):
- `phase_judging` → calls `setThreadVisibility(true)` to add judges to all threads, locks threads so nobody can type, and pings judges in `#judging`
- `phase_revealed` → opens all threads to everyone as read-only
- `phase_archived` → posts ranked results to the results channel, then locks and archives all threads

**`event_delete_confirm_*`** — Shows an ephemeral "are you sure?" message with entry count. Admin only.

**`event_delete_execute_*`** — Actually deletes everything: submission threads, the three event channels, the category, and all database rows. Admin only. Irreversible.

**`jmyprogress_*`** — Opens an ephemeral checklist for the clicking judge: every entry with a ✅/⬜ indicator, their personal score, and the current average. Only shown during the judging phase.

**`jview_*`** — Shows a judge the full details of an entry (title, description, link, current average score, their own score if they've already scored it). Only works during judging phase. Opens an ephemeral card with a "Score this Entry" button and a link to the submission thread.

**`jscore_*`** — Opens the score modal for a specific entry. Only works during judging phase. Judges can't score their own submissions.

---

### `commands/events/setup.js` — `/event-setup`
Admin-only. Creates a full competition from scratch:
1. Makes a category with the event name
2. Inside it, creates three channels:
   - `#submit` — public read, no typing; has the submission embed + buttons
   - `#judging` — the judging panel; hidden from everyone except judges and admins
   - `#results` — public read, no typing; where final placements get posted
3. Saves the event to the database
4. Posts the submission embed with the "Submit an Entry" and "Event Status" buttons
5. Posts the initial judging panel embed (empty, no entries yet) with phase control buttons

---

### `commands/events/status.js` — `/event-status`
Admin-only. Shows a stats card for an event: current phase, total submissions, how many have been scored, how many are still pending. Defaults to the most recent active event if no ID is given.

---

### `commands/events/delete.js` — `/event-delete`
Admin-only. Takes an event ID and shows a confirmation prompt before deleting. On confirm, wipes everything: all submission threads, the three event channels, the category, and all database records (submissions, scores, votes). Reuses the same confirm button as the Delete Event button in the judging panel, so the actual deletion logic lives in one place (`event_delete_execute_*` in `buttonHandler.js`).

---

### `utils/helpers.js`
Shared utility functions used across the bot.

**`generateCodename()`** — Picks a random adjective + noun + two-digit number (e.g. `Obsidian-Vortex-83`). Defined but not currently called — the submission flow stores the entry title as the codename instead.

**`statusBadge(status)`** — Converts internal status strings like `submissions_open` into readable labels like `Submissions Open`.

**`buildJudgeHub(name, eventId, rows, status)`** — Builds the full judging panel embed and button rows. The embed sidebar color shifts per phase (amber → blue → green → gray). Each entry line shows a ⬜/🟡/🟢 dot based on how many judges have scored it, plus the current average. The control row includes a **My Progress** button (judging phase only) that triggers `jmyprogress_*`, phase transition buttons, and Delete Event.

**`refreshJudgeHub(guild, event, stmts)`** — Fetches the pinned judging panel message and edits it in place so it always shows up-to-date entry counts and scores. Called after every submission and every score.

**`setThreadVisibility(guild, submissions, judgeRoleId, adminRoleId, visible)`** — Manages judge access to submission threads.
- `visible = true` (entering judging): fetches all guild members, adds every judge and admin role member to each private thread, then locks the threads. Locking prevents anyone without Manage Threads from typing — judges can read but not write.
- `visible = false` (reversing judging): removes judge view access, restores submitter write access, unlocks threads. This path is implemented but not called by any current phase transition — `phase_revealed` edits thread permissions inline instead.

**`submissionEmbed()`** — The confirmation embed that goes inside a submitter's private thread when they submit.

**`entryDetailEmbed()`** — The embed shown to a judge when they click a "View Entry" button in the judging panel. Shows title, description, link, current average, and the judge's own score if they've already scored it.

**`archiveEntryEmbed()`** — Builds a result embed for one entry: placement, creator, score, and any judge feedback. Defined here but the archive phase in `buttonHandler.js` builds these embeds inline — this function is not currently called.

---

## Environment variables (`.env`)

| Variable | What it's for |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `CLIENT_ID` | Bot's application ID (for deploying commands) |
| `GUILD_ID` | Your server's ID (commands deploy here) |
| `JUDGE_ROLE_ID` | Role ID for judges — controls thread access and judging panel visibility |
| `ADMIN_ROLE_ID` | Role ID for admins — can use phase buttons, delete events, etc. |

---

## How a typical event runs

1. Admin runs `/event-setup name:My Competition` → channels and judging panel appear
2. Participants click "Submit an Entry" in `#submit`, fill the form, upload files to their private thread
3. When ready, admin clicks **Start Judging** in the judging panel → judges get pinged in `#judging`, threads lock, judges are added as read-only members
4. Judges click entry buttons in the panel, open threads to review, score via the panel
5. Admin clicks **Reveal Results** → all threads go public read-only
6. Admin clicks **Archive Event** → ranked results posted to `#results`, threads archived

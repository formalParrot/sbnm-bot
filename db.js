const Database = require('better-sqlite3');
const db = new Database('events.db');

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id              TEXT NOT NULL,
    name                  TEXT NOT NULL,
    description           TEXT DEFAULT '',
    status                TEXT DEFAULT 'draft',
    category_id           TEXT,
    submission_channel_id TEXT,
    archive_channel_id    TEXT,
    results_channel_id    TEXT,
    judge_channel_id      TEXT,
    judge_hub_message_id  TEXT,
    deadline_timestamp    INTEGER,
    judging_deadline      INTEGER,
    config                TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id     INTEGER NOT NULL,
    user_id      TEXT NOT NULL,
    thread_id    TEXT NOT NULL,
    codename     TEXT NOT NULL,
    entry_num    INTEGER NOT NULL,
    title        TEXT,
    description  TEXT,
    link         TEXT,
    category     TEXT,
    status       TEXT DEFAULT 'pending',
    submitted_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    judge_id      TEXT NOT NULL,
    score         INTEGER NOT NULL,
    feedback      TEXT,
    scored_at     INTEGER DEFAULT (unixepoch()),
    UNIQUE(submission_id, judge_id),
    FOREIGN KEY(submission_id) REFERENCES submissions(id)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    user_id       TEXT NOT NULL,
    voted_at      INTEGER DEFAULT (unixepoch()),
    UNIQUE(submission_id, user_id),
    FOREIGN KEY(submission_id) REFERENCES submissions(id)
  );
`);

const stmts = {
  // Events
  insertEvent: db.prepare(`
    INSERT INTO events (guild_id, name, description, status, category_id, submission_channel_id, results_channel_id, judge_channel_id, deadline_timestamp)
    VALUES (@guild_id, @name, @description, 'submissions_open', @category_id, @submission_channel_id, @results_channel_id, @judge_channel_id, @deadline_timestamp)
  `),
  getEvent:           db.prepare('SELECT * FROM events WHERE id = ?'),
  getActiveEvent:     db.prepare("SELECT * FROM events WHERE guild_id = ? AND status NOT IN ('archived') ORDER BY id DESC LIMIT 1"),
  setEventStatus:     db.prepare('UPDATE events SET status = ? WHERE id = ?'),
  setJudgeHubMessage: db.prepare('UPDATE events SET judge_hub_message_id = ? WHERE id = ?'),
  listEvents:         db.prepare('SELECT id, name, status FROM events WHERE guild_id = ? ORDER BY id DESC'),

  // Submissions
  insertSubmission:      db.prepare(`
    INSERT INTO submissions (event_id, user_id, thread_id, codename, entry_num, title, description, link, category)
    VALUES (@event_id, @user_id, @thread_id, @codename, @entry_num, @title, @description, @link, @category)
  `),
  getSubmission:         db.prepare('SELECT * FROM submissions WHERE id = ?'),
  getSubmissionByThread: db.prepare('SELECT * FROM submissions WHERE thread_id = ?'),
  getSubmissionByUser:   db.prepare('SELECT * FROM submissions WHERE event_id = ? AND user_id = ?'),
  getSubmissionsByEvent: db.prepare('SELECT * FROM submissions WHERE event_id = ? ORDER BY entry_num ASC'),
  countSubmissions:      db.prepare('SELECT COUNT(*) as count FROM submissions WHERE event_id = ?'),

  // Scores
  upsertScore:           db.prepare(`
    INSERT OR REPLACE INTO scores (submission_id, judge_id, score, feedback)
    VALUES (@submission_id, @judge_id, @score, @feedback)
  `),
  getScore:              db.prepare('SELECT * FROM scores WHERE submission_id = ? AND judge_id = ?'),
  getScoresForSubmission:db.prepare('SELECT * FROM scores WHERE submission_id = ?'),
  getAvgScore:           db.prepare('SELECT ROUND(AVG(score),1) as avg, COUNT(*) as count FROM scores WHERE submission_id = ?'),

  // Delete event (scores → submissions → event)
  deleteEventScores:      db.prepare('DELETE FROM scores WHERE submission_id IN (SELECT id FROM submissions WHERE event_id = ?)'),
  deleteEventVotes:       db.prepare('DELETE FROM votes WHERE submission_id IN (SELECT id FROM submissions WHERE event_id = ?)'),
  deleteEventSubmissions: db.prepare('DELETE FROM submissions WHERE event_id = ?'),
  deleteEvent:            db.prepare('DELETE FROM events WHERE id = ?'),

  // Votes
  insertVote:   db.prepare('INSERT OR IGNORE INTO votes (submission_id, user_id) VALUES (?, ?)'),
  deleteVote:   db.prepare('DELETE FROM votes WHERE submission_id = ? AND user_id = ?'),
  countVotes:   db.prepare('SELECT COUNT(*) as count FROM votes WHERE submission_id = ?'),
  hasVoted:     db.prepare('SELECT 1 FROM votes WHERE submission_id = ? AND user_id = ?'),
};

module.exports = { db, stmts };

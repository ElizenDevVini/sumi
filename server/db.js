const Database = require("better-sqlite3");

const db = new Database(process.env.SUMI_DB || "./sumi.db");
db.pragma("journal_mode = WAL");

// Full schema is created up front so later phases have their tables; phase 1
// only reads/writes the engine_* tables and flags.
db.exec(`
  CREATE TABLE IF NOT EXISTS engine_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    m REAL NOT NULL,
    vel REAL NOT NULL,
    conviction REAL NOT NULL,
    mood TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS engine_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    m REAL NOT NULL,
    conviction REAL NOT NULL,
    mood TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS engine_inputs (
    label TEXT PRIMARY KEY,
    weight INTEGER NOT NULL,
    is_on INTEGER NOT NULL,
    ord INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    x_user_id TEXT PRIMARY KEY,
    handle TEXT,
    privy_user_id TEXT,
    wallet_address TEXT,
    banned INTEGER NOT NULL DEFAULT 0,
    trades_this_hour INTEGER NOT NULL DEFAULT 0,
    hour_window_start INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS autopilot (
    x_user_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    cap_usd REAL,
    spent_today_usd REAL NOT NULL DEFAULT 0,
    day TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    side TEXT,
    symbol TEXT,
    amount_in REAL,
    amount_out REAL,
    tx_hash TEXT,
    nonce INTEGER,
    status TEXT NOT NULL,
    mention_id TEXT UNIQUE,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS mentions (
    mention_id TEXT PRIMARY KEY,
    author_id TEXT,
    text TEXT,
    status TEXT NOT NULL,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS x_spend (
    day TEXT PRIMARY KEY,
    reads INTEGER NOT NULL DEFAULT 0,
    posts INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT,
    text TEXT,
    tx_hash TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS flags (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const stmts = {
  getState: db.prepare("SELECT m, vel, conviction, mood, updated_at FROM engine_state WHERE id = 1"),
  saveState: db.prepare(`
    INSERT INTO engine_state (id, m, vel, conviction, mood, updated_at)
    VALUES (1, @m, @vel, @conviction, @mood, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      m = @m, vel = @vel, conviction = @conviction, mood = @mood, updated_at = @updated_at
  `),
  insertHistory: db.prepare("INSERT INTO engine_history (ts, m, conviction, mood) VALUES (@ts, @m, @conviction, @mood)"),
  recentHistory: db.prepare("SELECT ts, m, conviction, mood FROM engine_history ORDER BY id DESC LIMIT ?"),
  countInputs: db.prepare("SELECT COUNT(*) AS n FROM engine_inputs"),
  allInputs: db.prepare("SELECT label, weight, is_on FROM engine_inputs ORDER BY ord"),
  seedInput: db.prepare("INSERT INTO engine_inputs (label, weight, is_on, ord) VALUES (@label, @weight, @is_on, @ord)"),
  setInputOn: db.prepare("UPDATE engine_inputs SET is_on = @is_on WHERE label = @label"),
  getFlag: db.prepare("SELECT value FROM flags WHERE key = ?"),
  setFlag: db.prepare("INSERT INTO flags (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value"),
};

module.exports = { db, stmts };

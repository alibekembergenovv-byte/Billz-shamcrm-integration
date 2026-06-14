const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('@neondatabase/serverless');
const path = require('path');

const isPostgres = process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'));
let dbSqlite = null;
let pgPool = null;

// Initialize connection
if (isPostgres) {
  console.log('Using PostgreSQL database connection...');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('Using local SQLite database...');
  const dbPath = path.join(__dirname, 'database.sqlite');
  dbSqlite = new sqlite3.Database(dbPath);
}

// Database initialization promise
const initPromise = new Promise((resolve, reject) => {
  if (isPostgres) {
    // 1. PostgreSQL Schema
    const schema = `
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        billz_secret TEXT,
        billz_token TEXT,
        billz_refresh_token TEXT,
        shamcrm_url TEXT DEFAULT 'http://localhost',
        shamcrm_token TEXT,
        sync_interval INTEGER DEFAULT 15,
        organization_id INTEGER DEFAULT 1,
        sales_funnel_id INTEGER DEFAULT 1,
        sync_products_active INTEGER DEFAULT 1,
        sync_clients_active INTEGER DEFAULT 1,
        sync_cashbox_active INTEGER DEFAULT 1,
        last_products_sync TEXT,
        last_clients_sync TEXT,
        last_cashbox_sync TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS mappings (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        billz_id TEXT NOT NULL,
        billz_name TEXT,
        shamcrm_id TEXT,
        shamcrm_name TEXT,
        UNIQUE(tenant_id, type, billz_id)
      );

      CREATE TABLE IF NOT EXISTS synced_entities (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        billz_id TEXT NOT NULL,
        shamcrm_id TEXT NOT NULL,
        additional_info TEXT,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, type, billz_id)
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        level VARCHAR(50) DEFAULT 'INFO',
        type VARCHAR(50),
        message TEXT,
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    pgPool.query(schema)
      .then(async () => {
        // Seed default tenant if empty
        const res = await pgPool.query('SELECT id FROM tenants LIMIT 1');
        if (res.rows.length === 0) {
          await pgPool.query("INSERT INTO tenants (name, slug) VALUES ('Asosiy mijoz', 'default')");
        }
        resolve();
      })
      .catch(err => {
        console.error('PostgreSQL Schema Init Error:', err);
        reject(err);
      });
  } else {
    // 2. SQLite Schema
    dbSqlite.serialize(() => {
      dbSqlite.run(`
        CREATE TABLE IF NOT EXISTS tenants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          billz_secret TEXT,
          billz_token TEXT,
          billz_refresh_token TEXT,
          shamcrm_url TEXT DEFAULT 'http://localhost',
          shamcrm_token TEXT,
          sync_interval INTEGER DEFAULT 15,
          organization_id INTEGER DEFAULT 1,
          sales_funnel_id INTEGER DEFAULT 1,
          sync_products_active INTEGER DEFAULT 1,
          sync_clients_active INTEGER DEFAULT 1,
          sync_cashbox_active INTEGER DEFAULT 1,
          last_products_sync TEXT,
          last_clients_sync TEXT,
          last_cashbox_sync TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      dbSqlite.run(`
        CREATE TABLE IF NOT EXISTS mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          billz_id TEXT NOT NULL,
          billz_name TEXT,
          shamcrm_id TEXT,
          shamcrm_name TEXT,
          UNIQUE(tenant_id, type, billz_id)
        )
      `);

      dbSqlite.run(`
        CREATE TABLE IF NOT EXISTS synced_entities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          billz_id TEXT NOT NULL,
          shamcrm_id TEXT NOT NULL,
          additional_info TEXT,
          synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tenant_id, type, billz_id)
        )
      `);

      dbSqlite.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
          level TEXT DEFAULT 'INFO',
          type TEXT,
          message TEXT,
          details TEXT,
          timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, [], (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Seed default tenant if empty
        dbSqlite.get('SELECT id FROM tenants LIMIT 1', (err, row) => {
          if (!row) {
            dbSqlite.run("INSERT INTO tenants (name, slug) VALUES ('Asosiy mijoz', 'default')", () => {
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
  }
});

// Helper functions that route queries based on DB type
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      // Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2...)
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes('?')) {
        pgSql = pgSql.replace('?', `$${count}`);
        count++;
      }
      // SQLite INSERT ON CONFLICT DO UPDATE uses excluded.col. PostgreSQL uses EXCLUDED.col too
      pgPool.query(pgSql, params)
        .then(res => resolve(res.rows))
        .catch(err => reject(err));
    } else {
      dbSqlite.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
}

function runCommand(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (isPostgres) {
      let pgSql = sql;
      let count = 1;
      while (pgSql.includes('?')) {
        pgSql = pgSql.replace('?', `$${count}`);
        count++;
      }
      pgPool.query(pgSql, params)
        .then(res => resolve({ lastID: null, changes: res.rowCount }))
        .catch(err => reject(err));
    } else {
      dbSqlite.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    }
  });
}

// API functions
async function getTenants() {
  return runQuery('SELECT id, name, slug FROM tenants ORDER BY id ASC');
}

async function addTenant(name, slug) {
  await runCommand('INSERT INTO tenants (name, slug) VALUES (?, ?)', [name, slug]);
  const rows = await runQuery('SELECT * FROM tenants WHERE slug = ?', [slug]);
  return rows[0];
}

async function deleteTenant(id) {
  return runCommand('DELETE FROM tenants WHERE id = ?', [id]);
}

async function getSettings(tenantId = 1) {
  const rows = await runQuery('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  return rows[0] || null;
}

async function updateSettings(tenantId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = Object.values(fields);
  
  return runCommand(`UPDATE tenants SET ${setClause} WHERE id = ?`, [...values, tenantId]);
}

async function getMappings(tenantId, type) {
  if (type) {
    return runQuery('SELECT * FROM mappings WHERE tenant_id = ? AND type = ?', [tenantId, type]);
  } else {
    return runQuery('SELECT * FROM mappings WHERE tenant_id = ?', [tenantId]);
  }
}

async function saveMapping(tenantId, type, billz_id, billz_name, shamcrm_id, shamcrm_name) {
  // SQLite and Postgres support identical INSERT ... ON CONFLICT syntax
  return runCommand(`
    INSERT INTO mappings (tenant_id, type, billz_id, billz_name, shamcrm_id, shamcrm_name)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, type, billz_id) DO UPDATE SET
      billz_name = excluded.billz_name,
      shamcrm_id = excluded.shamcrm_id,
      shamcrm_name = excluded.shamcrm_name
  `, [tenantId, type, billz_id, billz_name, shamcrm_id, shamcrm_name]);
}

async function getSyncedEntity(tenantId, type, billz_id) {
  const rows = await runQuery('SELECT * FROM synced_entities WHERE tenant_id = ? AND type = ? AND billz_id = ?', [tenantId, type, billz_id]);
  return rows[0] || null;
}

async function saveSyncedEntity(tenantId, type, billz_id, shamcrm_id, additional_info = null) {
  return runCommand(`
    INSERT INTO synced_entities (tenant_id, type, billz_id, shamcrm_id, additional_info)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, type, billz_id) DO UPDATE SET
      shamcrm_id = excluded.shamcrm_id,
      additional_info = excluded.additional_info,
      synced_at = CURRENT_TIMESTAMP
  `, [tenantId, type, billz_id, shamcrm_id, additional_info]);
}

async function addLog(tenantId, level, type, message, details = null) {
  const detailsStr = typeof details === 'object' ? JSON.stringify(details) : details;
  const now = new Date().toISOString();
  return runCommand(`
    INSERT INTO logs (tenant_id, level, type, message, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [tenantId, level, type, message, detailsStr, now]);
}

async function getLogs(tenantId, limit = 100, type = null) {
  if (type) {
    return runQuery('SELECT * FROM logs WHERE tenant_id = ? AND type = ? ORDER BY timestamp DESC LIMIT ?', [tenantId, type, limit]);
  } else {
    return runQuery('SELECT * FROM logs WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT ?', [tenantId, limit]);
  }
}

async function clearLogs(tenantId) {
  return runCommand('DELETE FROM logs WHERE tenant_id = ?', [tenantId]);
}

module.exports = {
  initPromise,
  getTenants,
  addTenant,
  deleteTenant,
  getSettings,
  updateSettings,
  getMappings,
  saveMapping,
  getSyncedEntity,
  saveSyncedEntity,
  addLog,
  getLogs,
  clearLogs
};

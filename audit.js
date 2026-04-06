const { getDb } = require('./db');

async function logAction(userId, action, entityType, entityId, details = null) {
  const db = getDb();
  await db.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, action, entityType, entityId, details ? JSON.stringify(details) : null);
}

module.exports = { logAction };

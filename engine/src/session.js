// engine/src/session.js
const store = {};  // in-memory for now; replace with Redis/DB

export async function getSession(id) {
  return store[id] || { history: [] };
}

export async function saveSession(id, session) {
  store[id] = session;
}

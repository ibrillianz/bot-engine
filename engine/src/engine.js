// engine/src/engine.js
import { callOpenAI } from "./openai.js";
import { retrieveContext } from "./retrieve.js";
import { getSession, saveSession } from "./session.js";

export async function handleMessage(botName, userMessage, sessionId) {
  // 1) Load or create session
  let session = await getSession(sessionId);

  // 2) Retrieve any relevant context (empty for now)
  const context = await retrieveContext(botName, userMessage);

  // 3) Ask OpenAI for a reply
  const reply = await callOpenAI(botName, userMessage, context, session);

  // 4) Save updated session (we'll build this later)
  await saveSession(sessionId, session);

  return reply;
}

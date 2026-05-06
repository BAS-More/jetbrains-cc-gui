/**
 * CrewAI channel command handler — communicates with the CrewAI FastAPI bridge.
 *
 * Uses HTTP fetch + SSE streaming to execute crew runs and retrieve
 * crew/agent listings. Translates SSE events into the tagged-line protocol
 * expected by the Java bridge.
 *
 * CrewAI bridge URL defaults to http://localhost:8000 and can be overridden
 * via the CREWAI_BRIDGE_URL environment variable.
 */

// Active sessions keyed by channelId / sessionId
const activeSessions = new Map();

/**
 * Execute a CrewAI command.
 * @param {string} command
 * @param {string[]} args
 * @param {object|null} stdinData
 */
export async function handleCrewAICommand(command, args, stdinData) {
  switch (command) {
    case 'send':
      await runCrew(stdinData || {});
      break;

    case 'abort': {
      const sessionId = stdinData?.sessionId || args[0];
      abortSession(sessionId);
      break;
    }

    case 'listCrews':
      await listCrews();
      break;

    case 'listAgents':
      await listAgents();
      break;

    case 'healthCheck':
      await healthCheck();
      break;

    case 'getSession':
      // CrewAI does not support session history retrieval
      console.log(JSON.stringify({
        success: false,
        error: 'getSession is not supported for CrewAI'
      }));
      break;

    default:
      throw new Error(`Unknown CrewAI command: ${command}`);
  }
}

/**
 * Get the configured bridge URL.
 */
function getBridgeUrl() {
  return process.env.CREWAI_BRIDGE_URL || 'http://localhost:8000';
}

/**
 * Run a crew with SSE streaming response.
 */
async function runCrew(params) {
  const {
    message,
    crewId,
    inputs,
    sessionId,
    channelId
  } = params;

  const bridgeUrl = getBridgeUrl();
  const capturedSessionId = sessionId || `crewai-${Date.now()}`;
  const processKey = channelId || capturedSessionId;

  const controller = new AbortController();
  activeSessions.set(processKey, { controller });

  console.log(`[SESSION_ID]${capturedSessionId}`);
  console.log(`[MESSAGE_START]`);

  try {
    const resp = await fetch(`${bridgeUrl}/crew/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crew_id: crewId || message,
        inputs: inputs || {}
      }),
      signal: controller.signal
    });

    if (!resp.ok) {
      throw new Error(`CrewAI bridge returned ${resp.status}: ${resp.statusText}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check if aborted
      const session = activeSessions.get(processKey);
      if (!session || session.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const event = JSON.parse(payload);
          processCrewEvent(event, capturedSessionId);
        } catch {
          // Skip malformed SSE events
        }
      }
    }

    console.log(`[MESSAGE]${JSON.stringify({
      type: 'result',
      status: 'success',
      text: 'Crew run completed'
    })}`);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`[MESSAGE]${JSON.stringify({
        type: 'result',
        status: 'aborted',
        text: 'Crew run aborted'
      })}`);
    } else {
      const errorMsg = err.code === 'ECONNREFUSED'
        ? `CrewAI bridge is offline. Start it at ${bridgeUrl} or set CREWAI_BRIDGE_URL.`
        : err.message;
      console.log(`[SEND_ERROR]${JSON.stringify({ error: errorMsg })}`);
    }
  } finally {
    activeSessions.delete(processKey);
    console.log(`[MESSAGE_END]`);
  }
}

/**
 * Process a single CrewAI SSE event and emit tagged lines.
 */
function processCrewEvent(event, sessionId) {
  switch (event.type) {
    case 'task_started':
      console.log(`[CONTENT_DELTA]🚀 Task started: ${event.task || event.description || ''}\n`);
      break;

    case 'task_output':
    case 'agent_output':
      console.log(`[CONTENT_DELTA]${event.output || event.text || JSON.stringify(event)}\n`);
      break;

    case 'task_completed':
      console.log(`[CONTENT_DELTA]✅ Task completed: ${event.task || ''}\n`);
      if (event.output) {
        console.log(`[CONTENT_DELTA]${event.output}\n`);
      }
      break;

    case 'crew_completed':
      console.log(`[CONTENT_DELTA]🏁 Crew run finished.\n`);
      if (event.result) {
        console.log(`[MESSAGE]${JSON.stringify({
          type: 'result',
          status: 'success',
          text: typeof event.result === 'string' ? event.result : JSON.stringify(event.result)
        })}`);
      }
      break;

    case 'error':
      console.log(`[SEND_ERROR]${JSON.stringify({ error: event.message || event.error || 'Unknown crew error' })}`);
      break;

    case 'thinking':
      console.log(`[THINKING]${event.text || event.content || ''}`);
      break;

    default:
      // Generic event — emit as content
      if (event.output || event.text || event.message) {
        console.log(`[CONTENT_DELTA]${event.output || event.text || event.message}\n`);
      }
      break;
  }
}

/**
 * List available crews from the bridge.
 */
async function listCrews() {
  try {
    const resp = await fetch(`${getBridgeUrl()}/crew/list`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(JSON.stringify({ success: true, data }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message, data: [] }));
  }
}

/**
 * List available agents from the bridge.
 */
async function listAgents() {
  try {
    const resp = await fetch(`${getBridgeUrl()}/agent/list`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(JSON.stringify({ success: true, data }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message, data: [] }));
  }
}

/**
 * Check CrewAI bridge health.
 */
async function healthCheck() {
  try {
    const resp = await fetch(`${getBridgeUrl()}/health`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(JSON.stringify({ success: true, data }));
  } catch (err) {
    console.log(JSON.stringify({
      success: false,
      data: { status: 'offline', error: err.message }
    }));
  }
}

/**
 * Abort an active crew session.
 */
function abortSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.aborted = true;
    session.controller?.abort();
    activeSessions.delete(sessionId);
    console.log(JSON.stringify({ success: true }));
  } else {
    console.log(JSON.stringify({ success: false, error: 'No active session found' }));
  }
}

export function getCrewAICommandList() {
  return ['send', 'abort', 'listCrews', 'listAgents', 'healthCheck', 'getSession'];
}

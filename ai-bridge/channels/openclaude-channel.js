/**
 * OpenClaude channel command handler — dispatches to the `occ` CLI binary.
 *
 * Spawns `occ` with `--output-format stream-json` and translates the
 * newline-delimited JSON output into the tagged-line protocol expected
 * by the Java bridge (same tags as Claude/Codex channels).
 *
 * 9Router integration: when OPENAI_API_BASE is set, it is forwarded as
 * ANTHROPIC_BASE_URL to the OCC subprocess so all LLM traffic flows
 * through 9Router (localhost:20128).
 */

import { spawn } from 'child_process';

// Active OCC processes keyed by channelId / sessionId
const activeProcesses = new Map();

/**
 * Execute an OpenClaude command.
 * @param {string} command
 * @param {string[]} args
 * @param {object|null} stdinData
 */
export async function handleOpenClaudeCommand(command, args, stdinData) {
  switch (command) {
    case 'send':
      await sendMessage(stdinData || {});
      break;

    case 'abort': {
      const sessionId = stdinData?.sessionId || args[0];
      abortSession(sessionId);
      break;
    }

    case 'getSession':
      // OCC does not expose session history via CLI; unsupported for now.
      console.log(JSON.stringify({
        success: false,
        error: 'getSession is not supported for OpenClaude'
      }));
      break;

    case 'healthCheck': {
      const occBin = process.env.OCC_PATH || 'occ';
      try {
        const child = spawn(occBin, ['--version'], { timeout: 5000 });
        let output = '';
        child.stdout.on('data', (d) => { output += d.toString(); });
        child.on('close', (code) => {
          console.log(JSON.stringify({
            success: code === 0,
            data: { version: output.trim(), installed: true }
          }));
        });
        child.on('error', () => {
          console.log(JSON.stringify({
            success: false,
            data: { installed: false, error: 'occ binary not found' }
          }));
        });
      } catch {
        console.log(JSON.stringify({ success: false, data: { installed: false } }));
      }
      break;
    }

    default:
      throw new Error(`Unknown OpenClaude command: ${command}`);
  }
}

/**
 * Send a message via OCC CLI.
 */
async function sendMessage(params) {
  const {
    message,
    sessionId,
    cwd,
    model,
    agentName,
    agentsPath,
    permissionMode,
    channelId
  } = params;

  const occBin = process.env.OCC_PATH || 'occ';
  const occArgs = [];

  // Resume existing session
  if (sessionId) {
    occArgs.push('--resume', sessionId);
  }

  // Prompt
  if (message && message.trim()) {
    occArgs.push('-p', message);
  }

  // Model override
  if (model) {
    occArgs.push('--model', model);
  }

  // Custom agent definitions
  if (agentsPath || process.env.OCC_AGENTS_PATH) {
    occArgs.push('--agents', agentsPath || process.env.OCC_AGENTS_PATH);
  }
  if (agentName) {
    occArgs.push('--agent', agentName);
  }

  // Always request streaming JSON
  occArgs.push('--output-format', 'stream-json');

  // Build spawn environment — route through 9Router when configured
  const spawnEnv = { ...process.env };
  if (process.env.OPENAI_API_BASE) {
    spawnEnv.ANTHROPIC_BASE_URL = process.env.OPENAI_API_BASE.replace('/v1', '');
  }

  const workingDir = cwd || process.cwd();
  const processKey = channelId || sessionId || `occ-${Date.now()}`;

  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let capturedSessionId = sessionId || null;

    console.log(`[openclaude] Spawning: ${occBin} ${occArgs.join(' ')}`);
    console.log(`[openclaude] CWD: ${workingDir}`);

    const child = spawn(occBin, occArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv
    });

    activeProcesses.set(processKey, child);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        processOccOutputLine(line.trim(), capturedSessionId, (newId) => {
          capturedSessionId = newId;
        });
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[openclaude] stderr: ${text}`);
        console.log(`[SEND_ERROR]${JSON.stringify({ error: text })}`);
      }
    });

    child.on('close', (code) => {
      // Flush remaining buffer
      if (stdoutBuffer.trim()) {
        processOccOutputLine(stdoutBuffer.trim(), capturedSessionId, () => {});
        stdoutBuffer = '';
      }

      activeProcesses.delete(processKey);
      console.log(`[MESSAGE_END]`);

      if (code !== 0) {
        console.log(`[openclaude] Process exited with code ${code}`);
      }

      resolve();
    });

    child.on('error', (err) => {
      activeProcesses.delete(processKey);
      const errorMsg = err.code === 'ENOENT'
        ? 'OpenClaude CLI (occ) is not installed. Install with: npm install -g @ruvnet/open-claude-code'
        : err.message;

      console.log(`[SEND_ERROR]${JSON.stringify({ error: errorMsg })}`);
      console.log(`[MESSAGE_END]`);
      resolve();
    });

    // Close stdin — OCC doesn't need interactive input
    child.stdin.end();
  });
}

/**
 * Process a single line of OCC stream-json output and emit tagged lines.
 */
function processOccOutputLine(line, currentSessionId, onSessionId) {
  try {
    const event = JSON.parse(line);

    switch (event.type) {
      case 'system':
        if (event.subtype === 'init' && event.session_id) {
          onSessionId(event.session_id);
          console.log(`[SESSION_ID]${event.session_id}`);
        }
        break;

      case 'assistant':
        if (event.message?.content) {
          console.log(`[MESSAGE_START]`);
          const content = Array.isArray(event.message.content)
            ? event.message.content
            : [{ type: 'text', text: String(event.message.content) }];

          for (const block of content) {
            if (block.type === 'text') {
              console.log(`[CONTENT_DELTA]${block.text}`);
            } else if (block.type === 'thinking') {
              console.log(`[THINKING]${block.thinking || block.text || ''}`);
            } else if (block.type === 'tool_use') {
              console.log(`[MESSAGE]${JSON.stringify({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input
              })}`);
            }
          }
        }
        break;

      case 'result':
        if (event.subtype === 'success') {
          console.log(`[MESSAGE]${JSON.stringify({
            type: 'result',
            status: 'success',
            text: event.result || ''
          })}`);
        } else {
          console.log(`[SEND_ERROR]${JSON.stringify({
            error: event.result || 'Unknown error'
          })}`);
        }
        break;

      default:
        // Pass through unknown event types as raw messages
        if (event.type) {
          console.log(`[MESSAGE]${JSON.stringify(event)}`);
        }
        break;
    }
  } catch {
    // Non-JSON line — emit as content delta
    if (line.trim()) {
      console.log(`[CONTENT_DELTA]${line}`);
    }
  }
}

/**
 * Abort an active OCC session.
 */
function abortSession(sessionId) {
  const child = activeProcesses.get(sessionId);
  if (child) {
    child.kill('SIGTERM');
    activeProcesses.delete(sessionId);
    console.log(JSON.stringify({ success: true }));
  } else {
    console.log(JSON.stringify({ success: false, error: 'No active session found' }));
  }
}

export function getOpenClaudeCommandList() {
  return ['send', 'abort', 'getSession', 'healthCheck'];
}

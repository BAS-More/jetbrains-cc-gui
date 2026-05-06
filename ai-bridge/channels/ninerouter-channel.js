/**
 * 9Router channel command handler — health checks, account listing, usage stats.
 *
 * 9Router runs at localhost:20128 and provides AI proxy/routing, format
 * translation, quota tracking, and OAuth token refresh for all providers.
 */

const DEFAULT_PORT = 20128;

function getRouterUrl() {
  const port = process.env.NINE_ROUTER_PORT || DEFAULT_PORT;
  return `http://localhost:${port}`;
}

/**
 * Execute a 9Router command.
 * @param {string} command
 * @param {string[]} args
 * @param {object|null} stdinData
 */
export async function handleNineRouterCommand(command, args, stdinData) {
  switch (command) {
    case 'healthCheck':
      await healthCheck();
      break;

    case 'getAccounts':
      await getAccounts();
      break;

    case 'getUsage':
      await getUsage();
      break;

    case 'getStatus':
      await getFullStatus();
      break;

    default:
      throw new Error(`Unknown 9Router command: ${command}`);
  }
}

async function healthCheck() {
  try {
    const resp = await fetch(`${getRouterUrl()}/api/init`, {
      signal: AbortSignal.timeout(3000)
    });
    console.log(JSON.stringify({
      success: true,
      data: { reachable: resp.ok, port: process.env.NINE_ROUTER_PORT || DEFAULT_PORT }
    }));
  } catch (err) {
    console.log(JSON.stringify({
      success: false,
      data: { reachable: false, error: err.message }
    }));
  }
}

async function getAccounts() {
  try {
    const resp = await fetch(`${getRouterUrl()}/api/connections`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const accounts = (data.connections || []).map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      status: c.status
    }));
    console.log(JSON.stringify({ success: true, data: accounts }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, data: [], error: err.message }));
  }
}

async function getUsage() {
  try {
    const resp = await fetch(`${getRouterUrl()}/api/usage`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(JSON.stringify({ success: true, data }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, data: {}, error: err.message }));
  }
}

async function getFullStatus() {
  try {
    const [health, accounts, usage] = await Promise.all([
      fetch(`${getRouterUrl()}/api/init`, { signal: AbortSignal.timeout(3000) })
        .then((r) => ({ reachable: r.ok }))
        .catch(() => ({ reachable: false })),
      fetch(`${getRouterUrl()}/api/connections`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok ? r.json() : { connections: [] })
        .then((d) => d.connections || [])
        .catch(() => []),
      fetch(`${getRouterUrl()}/api/usage`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok ? r.json() : {})
        .catch(() => ({}))
    ]);

    console.log(JSON.stringify({
      success: true,
      data: { ...health, accounts, usage, port: process.env.NINE_ROUTER_PORT || DEFAULT_PORT }
    }));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  }
}

export function getNineRouterCommandList() {
  return ['healthCheck', 'getAccounts', 'getUsage', 'getStatus'];
}

import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const isWindows = process.platform === 'win32'
const backendHealthUrl = process.env.CATCHUP_BACKEND_HEALTH_URL ?? 'http://127.0.0.1:8000/api/version'
const frontendHealthUrl = process.env.CATCHUP_FRONTEND_HEALTH_URL ?? 'http://127.0.0.1:5173/catchup/api/version'
const frontendPort = Number(process.env.CATCHUP_FRONTEND_PORT ?? 5173)
const backendReadyTimeoutMs = Number(process.env.CATCHUP_BACKEND_READY_TIMEOUT_MS ?? 20_000)
const frontendReadyTimeoutMs = Number(process.env.CATCHUP_FRONTEND_READY_TIMEOUT_MS ?? 5_000)
const readyIntervalMs = 250
const backendMonitorIntervalMs = Number(process.env.CATCHUP_BACKEND_MONITOR_INTERVAL_MS ?? 2_000)
const backendMonitorFailureLimit = Number(process.env.CATCHUP_BACKEND_MONITOR_FAILURE_LIMIT ?? 3)
const restartRequestFile =
  process.env.CATCHUP_DEV_RESTART_FILE ?? path.join(root, '.catchup-dev-restart')
const restartPollIntervalMs = Number(process.env.CATCHUP_DEV_RESTART_POLL_INTERVAL_MS ?? 250)

let shuttingDown = false
const running = []
let reusedFrontendPid = null
let backendChild = null
let backendRestartInProgress = false
let intentionalBackendExitPid = null

function stopAll(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of running) {
    if (!child.killed) child.kill('SIGINT')
  }
  setTimeout(() => process.exit(exitCode), 500)
}

function spawnProcess(item) {
  const child = spawn(item.command, item.args, {
    cwd: item.cwd,
    env: { ...process.env, ...(item.env ?? {}) },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: item.shell ?? false,
  })
  running.push(child)

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${item.name}] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${item.name}] ${chunk}`)
  })
  child.on('exit', (code, signal) => {
    const index = running.indexOf(child)
    if (index >= 0) running.splice(index, 1)
    if (shuttingDown) return
    if (item.name === 'backend' && intentionalBackendExitPid === child.pid) {
      intentionalBackendExitPid = null
      process.stderr.write('[backend] stopped for supervised restart\n')
      return
    }
    const reason = signal ? `signal ${signal}` : `code ${code}`
    process.stderr.write(`[${item.name}] exited with ${reason}\n`)
    if (item.name === 'backend') cleanupReusedFrontend()
    stopAll(code ?? 1)
  })

  return child
}

function spawnBackend() {
  backendChild = spawnProcess({
    name: 'backend',
    command: isWindows ? 'py' : 'python3',
    args: ['backend/main.py'],
    cwd: root,
    env: {
      CATCHUP_DEV_RESTART_FILE: restartRequestFile,
    },
  })
  return backendChild
}

async function isBackendReady() {
  return fetchOk(backendHealthUrl)
}

async function fetchOk(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForBackendReady() {
  return waitForUrlReady(backendHealthUrl, backendReadyTimeoutMs)
}

async function waitForUrlReady(url, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await fetchOk(url)) return true
    await new Promise((resolve) => setTimeout(resolve, readyIntervalMs))
  }
  return false
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.setTimeout(1_000, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function getListeningPid(port) {
  try {
    if (isWindows) {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
        ],
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim()
      const pid = Number(output)
      return Number.isFinite(pid) && pid > 0 ? pid : null
    }

    const output = execFileSync('sh', ['-lc', `lsof -ti tcp:${port} -sTCP:LISTEN | head -n 1`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const pid = Number(output)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function cleanupReusedFrontend() {
  if (!reusedFrontendPid || process.env.CATCHUP_REUSED_FRONTEND_CLEANUP === '0') return

  try {
    if (isWindows) {
      execFileSync('taskkill.exe', ['/PID', String(reusedFrontendPid), '/T', '/F'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
    } else {
      process.kill(reusedFrontendPid, 'SIGTERM')
    }
    process.stderr.write(`[frontend] stopped reused frontend process ${reusedFrontendPid}\n`)
  } catch {
    process.stderr.write(`[frontend] failed to stop reused frontend process ${reusedFrontendPid}\n`)
  } finally {
    reusedFrontendPid = null
  }
}

function startBackendMonitor() {
  let failures = 0
  const interval = setInterval(async () => {
    if (shuttingDown) {
      clearInterval(interval)
      return
    }
    if (backendRestartInProgress) return

    if (await isBackendReady()) {
      failures = 0
      return
    }

    failures += 1
    if (failures >= backendMonitorFailureLimit) {
      process.stderr.write(`[backend] health check failed while dev server is running: ${backendHealthUrl}\n`)
      clearInterval(interval)
      cleanupReusedFrontend()
      stopAll(1)
    }
  }, backendMonitorIntervalMs)
}

function removeRestartRequestFile() {
  try {
    fs.rmSync(restartRequestFile, { force: true })
  } catch {
    // 다음 polling에서 다시 처리한다.
  }
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = (exited) => {
      if (done) return
      done = true
      resolve(exited)
    }
    child.once('exit', () => finish(true))
    setTimeout(() => finish(false), timeoutMs)
  })
}

async function restartBackendFromRequest() {
  if (backendRestartInProgress || shuttingDown) return
  backendRestartInProgress = true
  removeRestartRequestFile()
  process.stdout.write('[backend] supervised restart requested\n')

  try {
    if (backendChild && !backendChild.killed) {
      const exitingBackend = backendChild
      intentionalBackendExitPid = exitingBackend.pid
      const exited = waitForChildExit(exitingBackend, 5_000)
      exitingBackend.kill('SIGINT')
      if (!(await exited)) {
        process.stderr.write('[backend] did not stop during supervised restart\n')
        stopAll(1)
        return
      }
    }

    spawnBackend()
    const backendReady = await waitForBackendReady()
    if (!backendReady) {
      process.stderr.write(`[backend] failed to become ready after restart: ${backendHealthUrl}\n`)
      stopAll(1)
      return
    }

    const frontendReady = await waitForUrlReady(frontendHealthUrl, frontendReadyTimeoutMs)
    if (!frontendReady) {
      process.stderr.write(`[frontend] proxy health failed after backend restart: ${frontendHealthUrl}\n`)
      stopAll(1)
      return
    }

    process.stdout.write('[backend] supervised restart completed\n')
  } finally {
    backendRestartInProgress = false
  }
}

function startRestartRequestWatcher() {
  removeRestartRequestFile()
  const interval = setInterval(() => {
    if (shuttingDown) {
      clearInterval(interval)
      return
    }
    if (fs.existsSync(restartRequestFile)) {
      void restartBackendFromRequest()
    }
  }, restartPollIntervalMs)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

const frontendAlreadyListening = await isPortOpen(frontendPort)

if (await isBackendReady()) {
  process.stdout.write('[backend] already running on http://127.0.0.1:8000\n')
} else {
  spawnBackend()

  const backendReady = await waitForBackendReady()
  if (!backendReady) {
    process.stderr.write(`[backend] failed to become ready: ${backendHealthUrl}\n`)
    stopAll(1)
  }
}

if (frontendAlreadyListening) {
  const frontendReady = await waitForUrlReady(frontendHealthUrl, frontendReadyTimeoutMs)
  if (!frontendReady) {
    process.stderr.write(
      `[frontend] 127.0.0.1:${frontendPort} is already in use but the API proxy is not healthy: ${frontendHealthUrl}\n` +
        '[frontend] stop the stale frontend process or free the port, then run `npm run dev` again.\n',
    )
    stopAll(1)
  } else {
    reusedFrontendPid = getListeningPid(frontendPort)
    process.stdout.write(`[frontend] already running with healthy backend proxy: ${frontendHealthUrl}\n`)
  }
} else {
  spawnProcess({
    name: 'frontend',
    command: process.execPath,
    args: [path.join(root, 'scripts', 'frontend-dev.mjs')],
    cwd: frontend,
    env: {
      CATCHUP_INTERNAL_FRONTEND_DEV: '1',
      CATCHUP_BACKEND_HEALTH_URL: backendHealthUrl,
    },
  })
}

startBackendMonitor()
startRestartRequestWatcher()

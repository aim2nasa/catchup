import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const isWindows = process.platform === 'win32'

const children = [
  {
    name: 'backend',
    command: isWindows ? 'py' : 'python3',
    args: ['backend/main.py'],
    cwd: root,
  },
  {
    name: 'frontend',
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    cwd: frontend,
  },
]

let shuttingDown = false
const running = []

function stopAll(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of running) {
    if (!child.killed) child.kill('SIGINT')
  }
  setTimeout(() => process.exit(exitCode), 500)
}

for (const item of children) {
  const child = spawn(item.command, item.args, {
    cwd: item.cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
  })
  running.push(child)

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${item.name}] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${item.name}] ${chunk}`)
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `code ${code}`
    process.stderr.write(`[${item.name}] exited with ${reason}\n`)
    stopAll(code ?? 1)
  })
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

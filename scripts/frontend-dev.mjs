import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const isWindows = process.platform === 'win32'
const backendHealthUrl = process.env.CATCHUP_BACKEND_HEALTH_URL ?? 'http://127.0.0.1:8000/api/version'

async function isBackendReady() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_000)
  try {
    const response = await fetch(backendHealthUrl, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

if (process.env.CATCHUP_INTERNAL_FRONTEND_DEV !== '1') {
  console.error([
    'frontend 단독 개발 서버 실행은 차단되었습니다.',
    '백엔드 없는 5173 서버는 조회 시 HTTP 502를 만들 수 있습니다.',
    '반드시 프로젝트 루트에서 `npm run dev`로 backend(8000)와 frontend(5173)를 함께 실행하세요.',
  ].join('\n'))
  process.exit(1)
}

if (!(await isBackendReady())) {
  console.error([
    'backend 준비 확인 실패로 frontend 개발 서버 실행을 중단합니다.',
    `확인 URL: ${backendHealthUrl}`,
    '프로젝트 루트에서 `npm run dev`를 다시 실행하세요.',
  ].join('\n'))
  process.exit(1)
}

const child = spawn(
  process.execPath,
  [path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'],
  {
    cwd: frontend,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  },
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

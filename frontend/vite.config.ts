import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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

export default defineConfig(async ({ command }) => {
  if (command === 'serve' && process.env.CATCHUP_INTERNAL_FRONTEND_DEV !== '1') {
    throw new Error([
      'frontend 단독 개발 서버 실행은 차단되었습니다.',
      '백엔드 없는 5173 서버는 조회 시 HTTP 502를 만들 수 있습니다.',
      '반드시 프로젝트 루트에서 `npm run dev`로 backend(8000)와 frontend(5173)를 함께 실행하세요.',
    ].join('\n'))
  }

  if (command === 'serve' && !(await isBackendReady())) {
    throw new Error([
      'backend 준비 확인 실패로 frontend 개발 서버 실행을 중단합니다.',
      `확인 URL: ${backendHealthUrl}`,
      '프로젝트 루트에서 `npm run dev`를 다시 실행하세요.',
    ].join('\n'))
  }

  return {
    base: '/catchup/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // dev에서 /catchup/api → backend (rewrite로 prefix 제거)
        '/catchup/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/catchup/, ''),
        },
        // 직접 /api 도 동일하게 동작 (호환)
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})

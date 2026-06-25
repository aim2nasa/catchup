"""개발 서버 실행 계약 회귀 테스트."""
import json
import http.server
import os
import subprocess
import threading
import time
import unittest
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent.parent


class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/version":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"version":"test"}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


class NotFoundHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


class FrontendProxyHealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/catchup/api/version":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"version":"frontend-test"}')
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


def start_test_server(handler):
    server = ThreadedHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


class TestDevServerContract(unittest.TestCase):
    def test_root_dev_script_runs_combined_server_launcher(self):
        package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package_json["scripts"]["dev"], "node scripts/dev.mjs")
        launcher = (ROOT / "scripts" / "dev.mjs").read_text(encoding="utf-8")
        self.assertIn("backend/main.py", launcher)
        self.assertIn("frontend-dev.mjs", launcher)
        self.assertIn("process.execPath", launcher)
        self.assertIn("backendHealthUrl", launcher)
        self.assertIn("frontendHealthUrl", launcher)
        self.assertIn("waitForBackendReady", launcher)
        self.assertIn("isPortOpen", launcher)
        self.assertIn("startBackendMonitor", launcher)
        self.assertIn("backendMonitorFailureLimit", launcher)
        self.assertIn("cleanupReusedFrontend", launcher)
        self.assertIn("CATCHUP_INTERNAL_FRONTEND_DEV", launcher)

    def test_frontend_dev_also_runs_combined_server_launcher(self):
        package_json = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package_json["scripts"]["dev"], "node ../scripts/dev.mjs")
        self.assertEqual(package_json["scripts"]["dev:frontend"], "node ../scripts/frontend-dev.mjs")

        frontend_launcher = (ROOT / "scripts" / "frontend-dev.mjs").read_text(encoding="utf-8")
        self.assertIn("CATCHUP_INTERNAL_FRONTEND_DEV", frontend_launcher)
        self.assertIn("CATCHUP_BACKEND_HEALTH_URL", frontend_launcher)
        self.assertIn("backend 준비 확인 실패", frontend_launcher)
        self.assertIn("frontend 단독 개발 서버 실행은 차단되었습니다.", frontend_launcher)
        self.assertIn("npm run dev", frontend_launcher)

    def test_frontend_dev_server_uses_fixed_port_only(self):
        vite_config = (ROOT / "frontend" / "vite.config.ts").read_text(encoding="utf-8")
        self.assertRegex(vite_config, re.compile(r"port:\s*5173"))
        self.assertRegex(vite_config, re.compile(r"strictPort:\s*true"))
        self.assertIn("CATCHUP_INTERNAL_FRONTEND_DEV", vite_config)
        self.assertIn("CATCHUP_BACKEND_HEALTH_URL", vite_config)
        self.assertIn("backend 준비 확인 실패", vite_config)
        self.assertIn("frontend 단독 개발 서버 실행은 차단되었습니다.", vite_config)

    def test_playwright_frontend_reuse_requires_backend_proxy_health(self):
        playwright_config = (ROOT / "playwright.config.ts").read_text(encoding="utf-8")
        self.assertIn("command: 'npm --prefix frontend run dev'", playwright_config)
        self.assertIn("url: 'http://127.0.0.1:5173/catchup/api/version'", playwright_config)

    def test_frontend_internal_dev_command_is_blocked_without_launcher(self):
        npm = "npm.cmd" if os.name == "nt" else "npm"
        env = os.environ.copy()
        env.pop("CATCHUP_INTERNAL_FRONTEND_DEV", None)

        result = subprocess.run(
            [npm, "run", "dev:frontend"],
            cwd=ROOT / "frontend",
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("frontend 단독 개발 서버 실행은 차단되었습니다.", result.stdout + result.stderr)

    def test_frontend_internal_flag_cannot_bypass_backend_health(self):
        npm = "npm.cmd" if os.name == "nt" else "npm"
        env = os.environ.copy()
        env["CATCHUP_INTERNAL_FRONTEND_DEV"] = "1"
        env["CATCHUP_BACKEND_HEALTH_URL"] = "http://127.0.0.1:9/api/version"

        result = subprocess.run(
            [npm, "run", "dev:frontend"],
            cwd=ROOT / "frontend",
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("backend 준비 확인 실패", result.stdout + result.stderr)

    def test_direct_vite_dev_server_is_blocked_without_launcher(self):
        vite = ROOT / "frontend" / "node_modules" / ".bin" / ("vite.cmd" if os.name == "nt" else "vite")
        env = os.environ.copy()
        env.pop("CATCHUP_INTERNAL_FRONTEND_DEV", None)

        result = subprocess.run(
            [str(vite), "--host", "127.0.0.1"],
            cwd=ROOT / "frontend",
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("frontend 단독 개발 서버 실행은 차단되었습니다.", result.stdout + result.stderr)

    def test_direct_vite_internal_flag_cannot_bypass_backend_health(self):
        vite = ROOT / "frontend" / "node_modules" / ".bin" / ("vite.cmd" if os.name == "nt" else "vite")
        env = os.environ.copy()
        env["CATCHUP_INTERNAL_FRONTEND_DEV"] = "1"
        env["CATCHUP_BACKEND_HEALTH_URL"] = "http://127.0.0.1:9/api/version"

        result = subprocess.run(
            [str(vite), "--host", "127.0.0.1"],
            cwd=ROOT / "frontend",
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=10,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("backend 준비 확인 실패", result.stdout + result.stderr)

    def test_stale_frontend_port_is_rejected_when_proxy_is_unhealthy(self):
        backend = start_test_server(HealthHandler)
        frontend = start_test_server(NotFoundHandler)
        try:
            backend_port = backend.server_address[1]
            frontend_port = frontend.server_address[1]
            env = os.environ.copy()
            env["CATCHUP_BACKEND_HEALTH_URL"] = f"http://127.0.0.1:{backend_port}/api/version"
            env["CATCHUP_FRONTEND_PORT"] = str(frontend_port)
            env["CATCHUP_FRONTEND_HEALTH_URL"] = f"http://127.0.0.1:{frontend_port}/catchup/api/version"
            env["CATCHUP_FRONTEND_READY_TIMEOUT_MS"] = "200"

            result = subprocess.run(
                ["node", "scripts/dev.mjs"],
                cwd=ROOT,
                env=env,
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                timeout=10,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("already in use but the API proxy is not healthy", result.stdout + result.stderr)
        finally:
            frontend.shutdown()
            frontend.server_close()
            backend.shutdown()
            backend.server_close()

    def test_reused_frontend_keeps_launcher_alive_and_monitors_backend(self):
        backend = start_test_server(HealthHandler)
        frontend = start_test_server(FrontendProxyHealthHandler)
        process = None
        try:
            backend_port = backend.server_address[1]
            frontend_port = frontend.server_address[1]
            env = os.environ.copy()
            env["CATCHUP_BACKEND_HEALTH_URL"] = f"http://127.0.0.1:{backend_port}/api/version"
            env["CATCHUP_FRONTEND_PORT"] = str(frontend_port)
            env["CATCHUP_FRONTEND_HEALTH_URL"] = f"http://127.0.0.1:{frontend_port}/catchup/api/version"
            env["CATCHUP_BACKEND_MONITOR_INTERVAL_MS"] = "100"
            env["CATCHUP_BACKEND_MONITOR_FAILURE_LIMIT"] = "1"
            env["CATCHUP_REUSED_FRONTEND_CLEANUP"] = "0"

            process = subprocess.Popen(
                ["node", "scripts/dev.mjs"],
                cwd=ROOT,
                env=env,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            time.sleep(0.5)
            self.assertIsNone(process.poll())

            backend.shutdown()
            backend.server_close()
            stdout, stderr = process.communicate(timeout=5)

            self.assertNotEqual(process.returncode, 0)
            self.assertIn("health check failed", stdout + stderr)
        finally:
            if process and process.poll() is None:
                process.kill()
                process.communicate(timeout=5)
            frontend.shutdown()
            frontend.server_close()
            if backend:
                try:
                    backend.shutdown()
                    backend.server_close()
                except Exception:
                    pass


if __name__ == "__main__":
    unittest.main(verbosity=2)

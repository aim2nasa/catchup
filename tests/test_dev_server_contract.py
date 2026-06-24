"""개발 서버 실행 계약 회귀 테스트."""
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class TestDevServerContract(unittest.TestCase):
    def test_root_dev_script_runs_combined_server_launcher(self):
        package_json = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package_json["scripts"]["dev"], "node scripts/dev.mjs")
        launcher = (ROOT / "scripts" / "dev.mjs").read_text(encoding="utf-8")
        self.assertIn("backend/main.py", launcher)
        self.assertIn("'run', 'dev'", launcher)

    def test_frontend_dev_binds_to_127_0_0_1(self):
        package_json = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(package_json["scripts"]["dev"], "vite --host 127.0.0.1")


if __name__ == "__main__":
    unittest.main(verbosity=2)

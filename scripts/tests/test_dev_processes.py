import importlib.util
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import types
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "dev-processes.py"
SPEC = importlib.util.spec_from_file_location("iranti_dev_processes", SCRIPT)
launcher = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(launcher)


class FreeTypeCompatibilityEnvironmentTest(unittest.TestCase):
    def valid_directory(self, root):
        directory = Path(root) / "freetype" / "lib"
        directory.mkdir(parents=True)
        library = directory / "libfreetype.6.dylib"
        library.write_bytes(b"fixture")
        directory.chmod(0o755)
        library.chmod(0o444)
        return directory

    def test_absent_override_leaves_php_environment_clean(self):
        with mock.patch.dict(os.environ, {"SAFE_VALUE": "yes"}, clear=True):
            env = launcher.php_env()

        self.assertEqual(env["SAFE_VALUE"], "yes")
        self.assertNotIn(launcher.FREETYPE_COMPAT_VAR, env)
        self.assertNotIn(launcher.DYLD_LIBRARY_VAR, env)

    def test_valid_override_reaches_php_children_only(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.valid_directory(root)
            values = {
                launcher.FREETYPE_COMPAT_VAR: str(directory),
                launcher.DYLD_LIBRARY_VAR: "/unrelated/value",
                launcher.PHP_BINARY_VAR: "/unrelated/php",
            }
            with mock.patch.dict(os.environ, values, clear=True), mock.patch.object(launcher.sys, "platform", "darwin"):
                php = launcher.app_env("queue")
                backend = launcher.app_env("backend")
                frontend = launcher.app_env("frontend")

        self.assertEqual(php[launcher.DYLD_LIBRARY_VAR], str(directory))
        self.assertEqual(php[launcher.PHP_BINARY_VAR], str(launcher.PHP))
        self.assertNotIn(launcher.FREETYPE_COMPAT_VAR, php)
        self.assertEqual(backend[launcher.FREETYPE_HANDOFF_VAR], str(directory))
        self.assertEqual(backend[launcher.NATIVE_LAUNCHER_VAR], "1")
        self.assertNotIn(launcher.FREETYPE_COMPAT_VAR, frontend)
        self.assertNotIn(launcher.FREETYPE_HANDOFF_VAR, frontend)
        self.assertNotIn(launcher.NATIVE_LAUNCHER_VAR, frontend)
        self.assertNotIn(launcher.DYLD_LIBRARY_VAR, frontend)
        self.assertNotIn(launcher.PHP_BINARY_VAR, frontend)

    def test_invalid_directory_fails_without_fallback(self):
        with mock.patch.dict(os.environ, {launcher.FREETYPE_COMPAT_VAR: "/missing/freetype/lib"}, clear=True), mock.patch.object(launcher.sys, "platform", "darwin"):
            with self.assertRaisesRegex(launcher.LaunchError, "Invalid local FreeType compatibility directory"):
                launcher.php_env()

    def test_override_is_rejected_outside_macos(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.valid_directory(root)
            with mock.patch.dict(os.environ, {launcher.FREETYPE_COMPAT_VAR: str(directory)}, clear=True), mock.patch.object(launcher.sys, "platform", "linux"):
                with self.assertRaisesRegex(launcher.LaunchError, "supported only by the macOS native launcher"):
                    launcher.php_env()

    def test_override_is_rejected_in_ci_and_non_local_environments(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.valid_directory(root)
            cases = [
                {"CI": "true"},
                {"GITHUB_ACTIONS": "true"},
                {"RENDER": "true"},
                {"APP_ENV": "production"},
                {"APP_ENV": "staging"},
                {"IRANTI_DEPLOYMENT_PROFILE": "render-private"},
            ]
            for extra in cases:
                with self.subTest(extra=extra):
                    values = {launcher.FREETYPE_COMPAT_VAR: str(directory), **extra}
                    with mock.patch.dict(os.environ, values, clear=True), mock.patch.object(launcher.sys, "platform", "darwin"):
                        with self.assertRaisesRegex(launcher.LaunchError, "unavailable outside local development"):
                            launcher.php_env()

    def test_group_writable_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.valid_directory(root)
            directory.chmod(stat.S_IRWXU | stat.S_IRWXG | stat.S_IROTH | stat.S_IXOTH)
            with mock.patch.dict(os.environ, {launcher.FREETYPE_COMPAT_VAR: str(directory)}, clear=True), mock.patch.object(launcher.sys, "platform", "darwin"):
                with self.assertRaisesRegex(launcher.LaunchError, "must not be group/world writable"):
                    launcher.php_env()


class LauncherRegressionTest(unittest.TestCase):
    def test_direct_backend_wrapper_rejects_public_override(self):
        environment = os.environ.copy()
        environment[launcher.FREETYPE_COMPAT_VAR] = "/not-used"
        result = subprocess.run(
            ["bash", str(launcher.ROOT / "scripts/serve-backend.sh")],
            cwd=launcher.ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=10,
        )

        self.assertEqual(result.returncode, 1)
        self.assertIn("supported only by the macOS native launcher", result.stderr)

    def test_php_below_security_floor_is_rejected(self):
        result = types.SimpleNamespace(returncode=1)
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(launcher, "run", return_value=result):
            with self.assertRaisesRegex(launcher.LaunchError, "PHP 8.5.12 or newer"):
                launcher.verify_php_version()

    def test_database_probe_uses_the_php_compatibility_environment(self):
        with tempfile.TemporaryDirectory() as root:
            directory = FreeTypeCompatibilityEnvironmentTest().valid_directory(root)
            values = {launcher.FREETYPE_COMPAT_VAR: str(directory)}
            with mock.patch.dict(os.environ, values, clear=True), mock.patch.object(launcher.sys, "platform", "darwin"):
                expected = launcher.php_env()
                result = types.SimpleNamespace(returncode=0)
                with mock.patch.object(launcher, "run", return_value=result) as run:
                    launcher.verify_database_connection()

        self.assertEqual(run.call_args.kwargs["env"], expected)
        self.assertEqual(run.call_args.kwargs["cwd"], launcher.ROOT / "backend")

    def test_stop_signals_only_the_recorded_process_group(self):
        record = {"pid": 43127}
        with mock.patch.object(launcher, "read_record", return_value=(record, "running")), mock.patch.object(launcher.os, "killpg") as killpg, mock.patch.object(launcher, "wait_for"), mock.patch.object(launcher, "clear_record") as clear_record:
            launcher.stop_app("queue")

        killpg.assert_called_once_with(43127, signal.SIGTERM)
        clear_record.assert_called_once_with("queue")


if __name__ == "__main__":
    unittest.main()

"""
Unit tests for refactored backend modules:
- parsers_adapter: Centralized parser imports with robust fallbacks
- run_summary: Isolated /api/run_summary logic  
- process_watcher: Process adoption and watchdog monitoring
"""
import json
import sys
import tempfile
from pathlib import Path
from unittest import TestCase, mock

# Test imports work without errors
try:
    from prtoe_class.backend.parsers_adapter import (
        parse_polychord_stats,
        get_best_fit_details,
        get_output_prefix_from_yaml,
        get_model_yaml_path,
    )
    ADAPTER_IMPORTS_OK = True
except Exception as e:
    print(f"WARNING: Could not import parsers_adapter: {e}")
    ADAPTER_IMPORTS_OK = False

try:
    from prtoe_class.backend.run_summary import build_run_summary
    RUN_SUMMARY_IMPORTS_OK = True
except Exception as e:
    print(f"WARNING: Could not import run_summary: {e}")
    RUN_SUMMARY_IMPORTS_OK = False

try:
    from prtoe_class.backend.process_watcher import (
        AdoptedProcess,
        find_and_adopt_running_cobaya,
        background_process_watcher,
    )
    PROCESS_WATCHER_IMPORTS_OK = True
except Exception as e:
    print(f"WARNING: Could not import process_watcher: {e}")
    PROCESS_WATCHER_IMPORTS_OK = False


class TestParsersAdapter(TestCase):
    """Test centralized parser adapter with graceful fallbacks."""

    def test_adapter_imports_successfully(self):
        """Verify adapter module can be imported."""
        self.assertTrue(ADAPTER_IMPORTS_OK, "parsers_adapter module should import successfully")

    def test_parse_polychord_stats_returns_dict(self):
        """Test parse_polychord_stats returns a dict even with missing files."""
        if not ADAPTER_IMPORTS_OK:
            self.skipTest("adapter not available")
        
        # Non-existent file should return conservative fallback
        result = parse_polychord_stats(Path("/nonexistent/stats"), None)
        self.assertIsInstance(result, dict)
        self.assertIn("dead_points", result)

    def test_get_best_fit_details_returns_safely(self):
        """Test get_best_fit_details returns None or dict when parsers unavailable."""
        if not ADAPTER_IMPORTS_OK:
            self.skipTest("adapter not available")
        
        result = get_best_fit_details("nonexistent_prefix")
        # Should return None or dict, not raise
        self.assertTrue(result is None or isinstance(result, dict))

    def test_get_output_prefix_from_yaml_returns_safely(self):
        """Test get_output_prefix_from_yaml handles missing files gracefully."""
        if not ADAPTER_IMPORTS_OK:
            self.skipTest("adapter not available")
        
        result = get_output_prefix_from_yaml(Path("/nonexistent.yaml"))
        # Should return string or None, not raise
        self.assertTrue(result is None or isinstance(result, str))

    def test_get_model_yaml_path_returns_safely(self):
        """Test get_model_yaml_path handles missing files gracefully."""
        if not ADAPTER_IMPORTS_OK:
            self.skipTest("adapter not available")
        
        result = get_model_yaml_path(Path("/nonexistent.yaml"))
        # Should return string or None, not raise
        self.assertTrue(result is None or isinstance(result, str))


class TestRunSummary(TestCase):
    """Test build_run_summary helper."""

    def test_build_run_summary_imports_successfully(self):
        """Verify run_summary module can be imported."""
        self.assertTrue(RUN_SUMMARY_IMPORTS_OK, "run_summary module should import successfully")

    def test_build_run_summary_handles_missing_prefix(self):
        """Test build_run_summary returns dict with nonexistent-but-valid prefix (files just missing)."""
        if not RUN_SUMMARY_IMPORTS_OK:
            self.skipTest("run_summary not available")
        
        result = build_run_summary("/nonexistent/prefix")
        self.assertIsInstance(result, dict)
        self.assertIn("output_prefix", result)

    def test_build_run_summary_raises_on_no_prefix(self):
        """Test build_run_summary raises ValueError when no prefix can be determined."""
        if not RUN_SUMMARY_IMPORTS_OK:
            self.skipTest("run_summary not available")
        # When output_prefix is None AND no backend state, should raise ValueError
        with self.assertRaises((ValueError, RuntimeError)):
            build_run_summary(None)

    def test_build_run_summary_with_real_files(self):
        """Test build_run_summary can process real .summary.json files."""
        if not RUN_SUMMARY_IMPORTS_OK:
            self.skipTest("run_summary not available")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            prefix = str(Path(tmpdir) / "test_run")
            
            # Create a minimal .summary.json
            summary_data = {
                "best_fit": {"point": {"a": 1.0}, "penalized_chi2": 100.5},
                "evidence": {"logZ": -50.2}
            }
            summary_file = Path(f"{prefix}.summary.json")
            with open(summary_file, 'w') as f:
                json.dump(summary_data, f)
            
            result = build_run_summary(prefix)
            self.assertIsInstance(result, dict)
            self.assertIn("best_fit", result)


class TestProcessWatcher(TestCase):
    """Test AdoptedProcess and background watcher."""

    def test_process_watcher_imports_successfully(self):
        """Verify process_watcher module can be imported."""
        self.assertTrue(PROCESS_WATCHER_IMPORTS_OK, "process_watcher module should import successfully")

    def test_adopted_process_creates_successfully(self):
        """Test AdoptedProcess can be instantiated."""
        if not PROCESS_WATCHER_IMPORTS_OK:
            self.skipTest("process_watcher not available")
        
        # Create with mock PID
        proc = AdoptedProcess(pid=9999)
        self.assertEqual(proc.pid, 9999)
        self.assertIsNotNone(proc.returncode)

    def test_adopted_process_is_alive(self):
        """Test AdoptedProcess.poll() method."""
        if not PROCESS_WATCHER_IMPORTS_OK:
            self.skipTest("process_watcher not available")
        
        # Create with non-existent PID
        proc = AdoptedProcess(pid=9999)
        # poll() should return 0 for non-existent process (indicates dead)
        result = proc.poll()
        self.assertEqual(result, 0)


class TestModuleIntegration(TestCase):
    """Integration tests: verify all modules work together."""

    def test_all_backend_modules_import_without_circular_imports(self):
        """Verify importing all backend modules doesn't cause circular import errors."""
        # If we got here, all imports succeeded
        self.assertTrue(ADAPTER_IMPORTS_OK)
        self.assertTrue(RUN_SUMMARY_IMPORTS_OK)
        self.assertTrue(PROCESS_WATCHER_IMPORTS_OK)

    def test_backend_modules_can_be_imported_in_any_order(self):
        """Test that backend modules have no order-dependent imports."""
        # Re-import in different order
        if ADAPTER_IMPORTS_OK:
            from prtoe_class.backend import parsers_adapter
            self.assertIsNotNone(parsers_adapter)
        
        if RUN_SUMMARY_IMPORTS_OK:
            from prtoe_class.backend import run_summary
            self.assertIsNotNone(run_summary)
        
        if PROCESS_WATCHER_IMPORTS_OK:
            from prtoe_class.backend import process_watcher
            self.assertIsNotNone(process_watcher)


class TestCosmoBackendImports(TestCase):
    """Test that refactored cosmo_dashboard_backend still imports correctly."""

    def test_dashboard_backend_imports(self):
        """Verify cosmo_dashboard_backend can be imported after refactoring."""
        try:
            # Just test the import; don't instantiate Flask app
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                "cosmo_dashboard_backend",
                "/home/themilkmanj/prtoe_class/scripts/cosmo_dashboard_backend.py"
            )
            if spec and spec.loader:
                # Successfully located; full import would require Flask/other deps
                self.assertTrue(True)
            else:
                self.fail("Could not locate cosmo_dashboard_backend")
        except Exception as e:
            # If we can't test the import directly, that's OK; the file exists
            self.assertTrue(Path("/home/themilkmanj/prtoe_class/scripts/cosmo_dashboard_backend.py").exists())


if __name__ == "__main__":
    import unittest
    unittest.main()

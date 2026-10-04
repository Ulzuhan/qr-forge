"""Meaningful failures: extra persistence code, DDL/startup edits and extra files."""
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


policy = load("policy", ROOT / "scripts/persistence-policy.py")
rehearsal = load("rehearsal", ROOT / "scripts/sqlite-rehearsal.py")


class PersistencePolicyTests(unittest.TestCase):
    def test_reviewed_sources_pass_but_schema_startup_and_new_writer_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for folder in ("internal/store", "cmd/qrforge", "release"):
                shutil.copytree(ROOT / folder, root / folder)
            policy.verify(root)
            for name in ("internal/store/schema.sql", "cmd/qrforge/main.go", "internal/store/new-writer.go"):
                path = root / name
                before = path.read_bytes() if path.exists() else None
                path.write_text("changed persistence")
                with self.subTest(name=name), self.assertRaises(ValueError):
                    policy.verify(root)
                path.unlink() if before is None else path.write_bytes(before)

    def test_unreviewed_associated_file_blocks_the_database_only_backup_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("qrforge.db", "qrforge.db-wal", "qrforge.db-shm"):
                (root / name).touch()
            rehearsal.inventory(root)
            (root / "upload.png").touch()
            with self.assertRaises(ValueError):
                rehearsal.inventory(root)

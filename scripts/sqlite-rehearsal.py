#!/usr/bin/env python3
"""Synthetic-only assertions for the image return and a separate stale-copy restore.

The launcher supplies a fresh temporary store. This is a test, never a deploy
hook: the image rollback uses the current database and does not call restore.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import time


def integrity(db):
    assert db.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []


def schema(db):
    return db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()


def inventory(store):
    # There are no uploaded/generated user files in this contract. WAL/SHM are
    # SQLite companions; the backup API includes committed WAL pages.
    unexpected = {p.name for p in store.iterdir()} - {"qrforge.db", "qrforge.db-wal", "qrforge.db-shm"}
    if unexpected:
        raise ValueError("associated files need a manually reviewed coordinated backup")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("baseline", "candidate", "returned"))
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    assert root.name.startswith("qrforge-rollback-"), "fresh synthetic root required"
    store = root / "store"
    inventory(store)
    db = sqlite3.connect(store / "qrforge.db")
    db.execute("PRAGMA foreign_keys=ON")
    integrity(db)
    record = root / "sqlite-record.json"
    revoked = hashlib.sha256(("d" * 64).encode()).hexdigest()
    expired = hashlib.sha256(("e" * 64).encode()).hexdigest()
    if args.phase == "baseline":
        now = int(time.time())
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA wal_autocheckpoint=0")
        db.executemany("INSERT INTO sessions VALUES(?,?,?,?)", [(revoked, "user-b", now, now + 3600), (expired, "user-b", now-7200, now-3600)])
        db.execute("INSERT INTO qr_scans(qr_id,scanned_at) VALUES('cartel',?)", (now-400*86400,))
        db.commit()
        assert (store / "qrforge.db-wal").stat().st_size > 0
        backup = sqlite3.connect(root / "before-update.db")
        db.backup(backup)
        integrity(backup)
        assert backup.execute("SELECT count(*) FROM sessions WHERE id=?", (revoked,)).fetchone() == (1,)
        assert backup.execute("SELECT count(*) FROM qr_scans WHERE scanned_at<?", (now-365*86400,)).fetchone() == (1,)
        state = {"schema": schema(db), "users": db.execute("SELECT id,oidc_sub,created_at FROM users ORDER BY id").fetchall(),
                 "cartel_created": db.execute("SELECT created_at FROM qr_codes WHERE id='cartel'").fetchone()[0], "time": now}
        assert 10**9 < state["cartel_created"] < 10**10
        record.write_text(json.dumps(state))
        backup.close()
    else:
        state = json.loads(record.read_text())
        assert json.loads(json.dumps(schema(db))) == state["schema"], "DDL change cannot enter image-only lane"
        assert json.loads(json.dumps(db.execute("SELECT id,oidc_sub,created_at FROM users ORDER BY id").fetchall())) == state["users"]
        assert db.execute("SELECT user_id,destination_url,created_at FROM qr_codes WHERE id='cartel'").fetchone() == ("user-a", "https://example.com/nuevo", state["cartel_created"])
        assert db.execute("SELECT user_id FROM qr_codes WHERE id='dego'").fetchone() == ("user-a",)
        assert db.execute("SELECT count(*) FROM sessions WHERE id=?", (expired,)).fetchone() == (0,), "expired session resurrected"
        assert db.execute("SELECT count(*) FROM qr_scans WHERE scanned_at<?", (state["time"]-365*86400,)).fetchone() == (0,), "retired analytics resurrected"
        if args.phase == "candidate":
            db.execute("DELETE FROM sessions WHERE id=?", (revoked,))
            db.commit()
            state["candidate_scans"] = db.execute("SELECT count(*) FROM qr_scans").fetchone()[0]
            record.write_text(json.dumps(state))
        else:
            assert db.execute("SELECT count(*) FROM sessions WHERE id=?", (revoked,)).fetchone() == (0,), "post-backup revocation resurrected"
            assert db.execute("SELECT count(*) FROM qr_scans").fetchone()[0] >= state["candidate_scans"]
            # Restore only into a NEW isolated target, while no app uses it.
            # This negative control proves why data restore is never automatic.
            restored = root / "restored"
            restored.mkdir()
            old = sqlite3.connect("file:" + str(root / "before-update.db") + "?mode=ro", uri=True)
            target = sqlite3.connect(restored / "qrforge.db")
            old.backup(target)
            integrity(target)
            assert target.execute("SELECT destination_url FROM qr_codes WHERE id='cartel'").fetchone() == ("https://example.com/uno",)
            assert target.execute("SELECT count(*) FROM qr_codes WHERE id='dego'").fetchone() == (0,)
            assert target.execute("SELECT count(*) FROM sessions WHERE id=?", (revoked,)).fetchone() == (1,)
            inventory(restored)
            target.close()
            old.close()
            print("PASS: image return kept current writes, slugs, owners, seconds and revocations")
            print("PASS: SQLite backup included committed WAL; restored copy integrity/FK valid")
            print("PROVEN LIMIT: stale restore loses newer QR writes and revives a later-revoked session; manual only")
    db.close()


if __name__ == "__main__":
    main()

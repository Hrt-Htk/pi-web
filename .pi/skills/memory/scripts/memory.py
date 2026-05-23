#!/usr/bin/env python3
"""Small CLI for Set Kyar's SQLite memory database."""

import argparse
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DB = ROOT / "data" / "memory.sqlite"
SCHEMA = ROOT / "data" / "schema.sql"


def conn():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def init_db(_args):
    with conn() as c:
        c.executescript(SCHEMA.read_text())
    print(f"initialized {DB}")


def add_memory(args):
    with conn() as c:
        cur = c.execute(
            """
            INSERT INTO memories (content, category, context, importance, sensitivity, source, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                args.content,
                args.category,
                args.context,
                args.importance,
                args.sensitivity,
                args.source,
                args.confidence,
            ),
        )
        row_id = cur.lastrowid
        c.execute(
            "INSERT INTO memory_events (event_type, table_name, row_id, summary, raw_input) VALUES (?, ?, ?, ?, ?)",
            ("create", "memories", row_id, args.content[:200], args.content),
        )
    print(f"memory #{row_id} added")


def add_reminder(args):
    with conn() as c:
        cur = c.execute(
            """
            INSERT INTO reminders (title, description, due_at, timezone, recurrence_rule, priority)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                args.title,
                args.description,
                args.due_at,
                args.timezone,
                args.recurrence,
                args.priority,
            ),
        )
        row_id = cur.lastrowid
        c.execute(
            "INSERT INTO memory_events (event_type, table_name, row_id, summary, raw_input) VALUES (?, ?, ?, ?, ?)",
            (
                "create",
                "reminders",
                row_id,
                args.title,
                json.dumps({k: v for k, v in vars(args).items() if k != "func"}),
            ),
        )
    print(f"reminder #{row_id} added")


def add_account(args):
    with conn() as c:
        cur = c.execute(
            """
            INSERT INTO financial_accounts
            (institution, account_name, account_type, currency, balance, balance_as_of, notes, sensitivity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                args.institution,
                args.account_name,
                args.account_type,
                args.currency,
                args.balance,
                args.balance_as_of,
                args.notes,
                args.sensitivity,
            ),
        )
        row_id = cur.lastrowid
        c.execute(
            "INSERT INTO memory_events (event_type, table_name, row_id, summary, raw_input) VALUES (?, ?, ?, ?, ?)",
            (
                "create",
                "financial_accounts",
                row_id,
                f"{args.institution} {args.account_name or ''}".strip(),
                json.dumps({k: v for k, v in vars(args).items() if k != "func"}),
            ),
        )
    print(f"financial account #{row_id} added")


def make_fts_query(query: str) -> str:
    tokens = re.findall(r"[\w]+", query, flags=re.UNICODE)
    return " OR ".join(f'"{token}"' for token in tokens) or '""'


def search(args):
    fts_q = make_fts_query(args.query)
    like_q = f"%{args.query}%"
    with conn() as c:
        try:
            rows = c.execute(
                """
                SELECT 'memory' AS type, m.id, m.content AS title, m.category, m.sensitivity,
                       m.created_at, bm25(memories_fts) AS rank
                FROM memories_fts
                JOIN memories m ON m.id = memories_fts.rowid
                WHERE memories_fts MATCH ? AND m.archived = 0
                ORDER BY rank, m.importance DESC, m.updated_at DESC
                LIMIT ?
                """,
                (fts_q, args.limit),
            ).fetchall()
        except sqlite3.OperationalError:
            rows = []

        if not rows:
            rows = c.execute(
                """
                SELECT 'memory' AS type, id, content AS title, category, sensitivity, created_at, NULL AS rank
                FROM memories
                WHERE archived = 0 AND (content LIKE ? OR category LIKE ? OR IFNULL(context,'') LIKE ?)
                ORDER BY importance DESC, updated_at DESC
                LIMIT ?
                """,
                (like_q, like_q, like_q, args.limit),
            ).fetchall()

    for r in rows:
        print(
            f"[{r['type']} #{r['id']}] {r['title']} ({r['category']}, {r['sensitivity']}, {r['created_at']})"
        )


def list_reminders(args):
    with conn() as c:
        rows = c.execute(
            "SELECT id, title, due_at, timezone, status, priority FROM reminders WHERE status = ? ORDER BY due_at LIMIT ?",
            (args.status, args.limit),
        ).fetchall()
    for r in rows:
        print(
            f"[reminder #{r['id']}] {r['due_at']} {r['timezone']} - {r['title']} ({r['status']}, p{r['priority']})"
        )


def apply_schema_change(args):
    sql = args.sql.strip().rstrip(";")
    normalized = " ".join(sql.lower().split())
    allowed_prefixes = (
        "create table if not exists ",
        "create index if not exists ",
        "create unique index if not exists ",
        "alter table ",
    )
    blocked_words = (
        " drop ",
        " delete ",
        " update ",
        " insert ",
        " replace ",
        " truncate ",
        " vacuum",
        " attach ",
        " detach ",
    )

    if not normalized.startswith(allowed_prefixes):
        raise SystemExit(
            "Refusing schema change: only additive CREATE TABLE/INDEX or ALTER TABLE ADD COLUMN is allowed"
        )
    if normalized.startswith("alter table ") and " add column " not in normalized:
        raise SystemExit("Refusing ALTER TABLE: only ADD COLUMN is allowed")
    padded = f" {normalized} "
    if any(word in padded for word in blocked_words):
        raise SystemExit(
            "Refusing schema change: destructive or data-mutating SQL detected"
        )

    with conn() as c:
        c.execute(sql)
        c.execute(
            "INSERT INTO schema_changes (change_type, object_name, reason, sql, applied_by) VALUES (?, ?, ?, ?, ?)",
            (args.change_type, args.object_name, args.reason, sql, args.applied_by),
        )
        c.execute(
            "INSERT INTO memory_events (event_type, table_name, summary, raw_input) VALUES (?, ?, ?, ?)",
            (
                "schema_change",
                "schema_changes",
                f"{args.change_type}: {args.object_name}",
                args.reason,
            ),
        )
    print(f"schema change applied and logged: {args.object_name}")


def list_schema_changes(args):
    with conn() as c:
        rows = c.execute(
            "SELECT id, change_type, object_name, reason, created_at FROM schema_changes ORDER BY created_at DESC LIMIT ?",
            (args.limit,),
        ).fetchall()
    for r in rows:
        print(
            f"[schema #{r['id']}] {r['created_at']} {r['change_type']} {r['object_name']} - {r['reason']}"
        )


def main():
    p = argparse.ArgumentParser(description="Manage local agent memory")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("init")
    s.set_defaults(func=init_db)

    s = sub.add_parser("add-memory")
    s.add_argument("content")
    s.add_argument("--category", default="general")
    s.add_argument("--context")
    s.add_argument("--importance", type=int, default=3)
    s.add_argument(
        "--sensitivity", choices=["low", "normal", "high", "secret"], default="normal"
    )
    s.add_argument("--source", default="user request")
    s.add_argument("--confidence", type=float, default=1.0)
    s.set_defaults(func=add_memory)

    s = sub.add_parser("add-reminder")
    s.add_argument("title")
    s.add_argument(
        "--due-at", required=True, help="ISO-like date/time, e.g. 2026-05-21 09:00"
    )
    s.add_argument("--description")
    s.add_argument("--timezone", default="Asia/Singapore")
    s.add_argument("--recurrence")
    s.add_argument("--priority", type=int, default=3)
    s.set_defaults(func=add_reminder)

    s = sub.add_parser("add-account")
    s.add_argument("institution")
    s.add_argument("--account-name")
    s.add_argument("--account-type")
    s.add_argument("--currency", default="USD")
    s.add_argument("--balance", type=float)
    s.add_argument("--balance-as-of")
    s.add_argument("--notes")
    s.add_argument(
        "--sensitivity", choices=["low", "normal", "high", "secret"], default="high"
    )
    s.set_defaults(func=add_account)

    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(func=search)

    s = sub.add_parser("reminders")
    s.add_argument("--status", default="pending")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(func=list_reminders)

    s = sub.add_parser("schema-change")
    s.add_argument(
        "--sql",
        required=True,
        help="Additive SQL only: CREATE TABLE/INDEX IF NOT EXISTS, or ALTER TABLE ADD COLUMN",
    )
    s.add_argument("--reason", required=True)
    s.add_argument("--object-name", required=True)
    s.add_argument(
        "--change-type",
        choices=[
            "create_table",
            "create_index",
            "alter_table_add_column",
            "other_additive",
        ],
        required=True,
    )
    s.add_argument("--applied-by", default="agent")
    s.set_defaults(func=apply_schema_change)

    s = sub.add_parser("schema-changes")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(func=list_schema_changes)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

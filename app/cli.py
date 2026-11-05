"""ws26 CLI. `ws26 leads` prints leads as CSV; `ws26 feedback` prints session-finder votes and notes;
`ws26 stats [days]` prints the anonymous usage summary as JSON;
`ws26 report [days]` prints the same data as a readable report: goals reached, top saves, feedback, visits."""
import csv
import json
import sys

from . import db


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] not in ("leads", "feedback", "stats", "report"):
        print("usage: ws26 leads | ws26 feedback | ws26 stats [days] | ws26 report [days]", file=sys.stderr)
        return 2
    if argv[0] == "report":
        from .report import usage_report
        print(usage_report(days=int(argv[1]) if len(argv) > 1 else 7))
        return 0
    if argv[0] == "stats":
        print(json.dumps(db.hit_stats(days=int(argv[1]) if len(argv) > 1 else 7), indent=1))
        return 0
    w = csv.writer(sys.stdout)
    if argv[0] == "feedback":
        w.writerow(["id", "created_at", "kind", "vote", "note", "query", "ids_json"])
        for r in db.list_feedback():
            w.writerow([r["id"], r["created_at"], r["kind"], r["vote"], r["note"], r["query"], r["ids_json"]])
        return 0
    rows = db.list_leads()
    w.writerow(["id", "created_at", "channel", "contact", "tg_user", "tg_chat_id", "sent_ok", "error", "answers_json", "plan_ids_json"])
    for r in rows:
        w.writerow([r["id"], r["created_at"], r["channel"], r["contact"], r["tg_user"], r["tg_chat_id"], r["sent_ok"], r["error"], r["answers_json"], r["plan_ids_json"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())

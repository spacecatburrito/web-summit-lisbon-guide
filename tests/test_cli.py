import importlib, io, sys


def test_leads_csv(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("WS26_DB_PATH", str(tmp_path / "l.db"))
    from app import settings as s, db, cli
    importlib.reload(s); importlib.reload(db); importlib.reload(cli)
    db.create_lead("email", "a@b.co", {"role": "founder"}, ["x"], [])
    assert cli.main(["leads"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0].startswith("id,created_at,channel,contact")
    assert "a@b.co" in out[1]


def test_report_prints_readable_summary(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("WS26_DB_PATH", str(tmp_path / "r.db"))
    from app import settings as s, db, report, cli
    importlib.reload(s); importlib.reload(db); importlib.reload(report); importlib.reload(cli)
    db.save_hit("visit1", "uid1", "view", {"src": "direct", "dev": "mobile", "tab": "summit"})
    assert cli.main(["report", "3"]) == 0
    out = capsys.readouterr().out
    assert "last 3 days" in out and "1 visit by 1 person" in out

"""public/quiz-data.js and app/quiz_options.py must agree on option ids."""
import json, subprocess, sys
from pathlib import Path
from app.quiz_options import OPTIONS

ROOT = Path(__file__).resolve().parents[1]


def test_quiz_option_ids_match_js():
    js = "import {QUIZ} from '%s'; console.log(JSON.stringify(Object.fromEntries(QUIZ.map(q=>[q.id,q.options.map(o=>o.id)]))))" % (ROOT / "public" / "quiz-data.js")
    out = subprocess.run([ "node", "--input-type=module", "-e", js], capture_output=True, text=True, check=True).stdout
    from_js = {k: set(v) for k, v in json.loads(out).items()}
    assert from_js == OPTIONS

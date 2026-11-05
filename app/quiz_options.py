"""Mirror of public/quiz-data.js option ids. Keep both in sync by hand (tests/test_quiz_sync.py checks it)."""
OPTIONS = {
    "role": {"founder", "product", "investor", "sales", "recruiter", "corporate", "other"},
    "goal": {"hire", "get_hired", "cofounder", "raise", "sell", "learn", "party"},
    "sector": {"fintech", "crypto", "ai", "saas", "consumer", "any"},
    "badge": {"yes", "no"},
    "days": {"d08", "d09", "d10", "d11", "d12", "d13"},
    "evenings": {"party", "drinks", "day"},
    "groups": {"ru", "latam", "women", "crypto_biz", "none"},
}
MULTI = {"days", "groups"}


def validate_answers(answers: dict) -> list[str]:
    """Return a list of problems; empty means valid."""
    problems = []
    for key, allowed in OPTIONS.items():
        if key not in answers:
            if key == "groups":
                continue
            problems.append(f"missing {key}")
            continue
        val = answers[key]
        if key in MULTI:
            if not isinstance(val, list) or not set(val) <= allowed:
                problems.append(f"bad {key}")
        elif val not in allowed:
            problems.append(f"bad {key}")
    extra = set(answers) - set(OPTIONS)
    if extra:
        problems.append(f"unknown keys {sorted(extra)}")
    return problems

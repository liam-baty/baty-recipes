#!/usr/bin/env python3
"""
Add recipes sent from the app ("Send to the book") into recipes.json.

How to use
----------
1. Save the message the app sent (the whole thing is fine) as a .txt file in
   tools/inbox/  (e.g. tools/inbox/scones.txt). One file can hold several recipes.
2. Open PowerShell in the "Baty recipes app" folder and run:

       python tools/add_to_book.py

   Add  --check  to see what would happen without changing anything.
   You can also name files directly:  python tools/add_to_book.py path/to/file.txt
3. Commit and push in GitHub Desktop.

What it does
------------
- New recipes go at the end of their group; changed recipes replace the old
  version in place (and move if you changed the group).
- recipes.json keeps its exact layout, so GitHub Desktop shows only real changes.
- The recipe data version and date go up, and the app version in sw.js is bumped
  so phones offer "Update now".
- Processed files are moved to tools/inbox/done/.
"""

import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RECIPES = ROOT / "recipes.json"
SW = ROOT / "sw.js"
INBOX = ROOT / "tools" / "inbox"

BEGIN = "-----BEGIN BATY RECIPE-----"
END = "-----END BATY RECIPE-----"
FIELDS = ["id", "title", "part", "group", "source", "yield", "time", "introNotes",
          "ingredients", "steps", "notes", "appliances", "related", "tables", "needsCheck"]
APPLIANCES = {"oven", "microwave", "breadmaker", "slow cooker", "steamer", "pie maker", "air fryer"}


def find_blocks(text):
    """Every recipe between the BEGIN/END markers in a message."""
    return re.findall(re.escape(BEGIN) + r"(.*?)" + re.escape(END), text, flags=re.S)


def parse_block(block):
    try:
        return json.loads(block)
    except json.JSONDecodeError:
        # Some email apps wrap long lines; line breaks are never needed inside the data.
        # Joining the lines can leave double spaces inside text, so tidy those too.
        return squash_spaces(json.loads(block.replace("\r", "").replace("\n", " ")))


def squash_spaces(value):
    if isinstance(value, str):
        return re.sub(r" {2,}", " ", value)
    if isinstance(value, list):
        return [squash_spaces(v) for v in value]
    if isinstance(value, dict):
        return {k: squash_spaces(v) for k, v in value.items()}
    return value


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "recipe"


def check_recipe(r, groups):
    """Return a list of problems (empty if the recipe looks right)."""
    problems = []
    if not isinstance(r.get("title"), str) or not r["title"].strip():
        problems.append("it has no title")
    if r.get("group") not in groups:
        problems.append(f"group '{r.get('group')}' isn't one of the book's groups")
    ing = r.get("ingredients")
    if not isinstance(ing, list) or not all(isinstance(g, dict) and isinstance(g.get("items"), list) for g in ing):
        problems.append("the ingredients aren't in the expected shape")
    steps = r.get("steps")
    if not isinstance(steps, list) or not all(isinstance(s, dict) and isinstance(s.get("text"), str) for s in steps):
        problems.append("the method steps aren't in the expected shape")
    unknown = set(r.get("appliances") or []) - APPLIANCES
    if unknown:
        problems.append(f"unknown appliances: {', '.join(sorted(unknown))}")
    return problems


def tidy(r, groups):
    """Put fields in the book's order with the book's defaults."""
    out = {}
    for k in FIELDS:
        if k == "part":
            out["part"] = groups[r["group"]]
        elif k == "needsCheck":
            out["needsCheck"] = bool(r.get("needsCheck", False))
        elif k in ("related", "tables"):
            if r.get(k):
                out[k] = r[k]
        elif k in ("introNotes", "ingredients", "steps", "notes", "appliances"):
            out[k] = r.get(k) or []
        else:
            v = r.get(k)
            out[k] = v.strip() if isinstance(v, str) and v.strip() else (v if not isinstance(v, str) else None)
    out["title"] = out["title"].strip()
    if not out.get("id"):
        out["id"] = slug(out["title"])
    out["steps"] = [{"text": s["text"], "section": s["section"]} if s.get("section") else {"text": s["text"]}
                    for s in out["steps"]]
    return out


def place(book, r, action):
    """Insert or replace r in book['recipes']. Returns a short description."""
    recipes = book["recipes"]
    by_id = {x["id"]: i for i, x in enumerate(recipes)}

    if r["id"] in by_id:
        i = by_id[r["id"]]
        old = recipes[i]
        if action == "add" and old["title"].strip().lower() != r["title"].lower():
            # Different recipe with the same id: give the new one its own id
            base, n = r["id"], 2
            while f"{base}-{n}" in by_id:
                n += 1
            r["id"] = f"{base}-{n}"
            note = f" (id changed to '{r['id']}' because another recipe uses '{base}')"
        else:
            if old == r:
                return f"no change: '{r['title']}' is already in the book exactly like this"
            if old["group"] == r["group"]:
                recipes[i] = r
                return f"updated '{r['title']}' in {r['group']}"
            del recipes[i]
            note = f" (moved from {old['group']})"
    else:
        note = ""

    # New (or moved) recipe goes after the last recipe in its group,
    # or after the previous group's recipes if the group is empty.
    order = [g for p in book["parts"] for g in p["groups"]]
    gi = order.index(r["group"])
    pos = 0
    for i, x in enumerate(recipes):
        if x["group"] in order and order.index(x["group"]) <= gi:
            pos = i + 1
    recipes.insert(pos, r)
    verb = "updated" if note.startswith(" (moved") else "added"
    return f"{verb} '{r['title']}' to {r['group']}{note}"


def bump_app_version():
    text = SW.read_text(encoding="utf-8")
    m = re.search(r"const VERSION = '(\d+)\.(\d+)\.(\d+)';", text)
    if not m:
        return None
    new = f"{m.group(1)}.{m.group(2)}.{int(m.group(3)) + 1}"
    SW.write_text(text[:m.start()] + f"const VERSION = '{new}';" + text[m.end():], encoding="utf-8", newline="\n")
    return new


def main(argv):
    check_only = "--check" in argv
    paths = [pathlib.Path(a) for a in argv if not a.startswith("--")]
    if not paths:
        INBOX.mkdir(parents=True, exist_ok=True)
        paths = sorted(INBOX.glob("*.txt"))
        if not paths:
            print(f"Nothing to do: put the message from the app in {INBOX} as a .txt file.")
            return 1

    raw = RECIPES.read_text(encoding="utf-8")
    book = json.loads(raw)
    groups = {g: p["name"] for p in book["parts"] for g in p["groups"]}

    done, results, failed = [], [], False
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        blocks = find_blocks(text)
        if not blocks:
            print(f"✗ {path.name}: no recipe found (looking for the {BEGIN} line).")
            failed = True
            continue
        file_ok = True
        for block in blocks:
            try:
                payload = parse_block(block)
                r = payload["recipe"]
                action = payload.get("action", "add")
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                print(f"✗ {path.name}: the recipe text is damaged and couldn't be read ({e}).")
                print("  Try sending it again, or copy it rather than forwarding it.")
                failed, file_ok = True, False
                continue
            problems = check_recipe(r, groups)
            if problems:
                print(f"✗ {path.name}: '{r.get('title', '?')}' wasn't added: " + "; ".join(problems) + ".")
                failed, file_ok = True, False
                continue
            results.append("✓ " + place(book, tidy(r, groups), action))
        if file_ok:
            done.append(path)  # files with a problem stay in the inbox to fix and retry

    for line in results:
        print(line)
    changed = json.dumps(book, ensure_ascii=False, indent=2) != raw

    if check_only:
        print("\n(--check: nothing was changed.)")
        return 1 if failed else 0

    def file_away():
        for path in done:
            if path.parent.resolve() == INBOX.resolve():
                (INBOX / "done").mkdir(exist_ok=True)
                path.replace(INBOX / "done" / path.name)

    if not changed:
        file_away()
        print("\nrecipes.json is unchanged.")
        return 1 if failed else 0

    book["version"] = int(book.get("version", 0)) + 1
    book["generated"] = datetime.date.today().isoformat()
    RECIPES.write_text(json.dumps(book, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")
    new_version = bump_app_version()
    file_away()

    print(f"\nSaved recipes.json (now {len(book['recipes'])} recipes, data version {book['version']}).")
    if new_version:
        print(f"App version bumped to {new_version} in sw.js.")
    print("Next: open GitHub Desktop, Commit to main, then Push origin.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))

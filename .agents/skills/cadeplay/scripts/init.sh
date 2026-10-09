#!/usr/bin/env bash
#
# Cadeplay — prepare a project.
#
# It does two things: put the token in `.env`, and keep that file out of git.
#
# 🛑 **It never takes the token as an argument.** A coding agent runs this
#    script, and anything passed as an argument survives in the conversation
#    log, the shell history, and the agent's own logs. The script creates the
#    slot; a human pastes the value in an editor.
#
# Usage:
#   bash init.sh [project path]        defaults to the current directory
#
# Safe to run repeatedly — anything already in place is left alone.

set -euo pipefail

DIR="${1:-.}"
[ -d "$DIR" ] || { printf 'no such directory: %s\n' "$DIR" >&2; exit 1; }
cd "$DIR"

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"
GITIGNORE=".gitignore"
KEY="CADEPLAY_TOKEN"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
add()  { printf '  \033[36m+\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

printf '\nCadeplay project setup — %s\n\n' "$(pwd)"

# Append a newline when the file does not end with one. Without this the line
# we add joins the last existing line and neither setting is read.
ensure_newline() {
    [ -s "$1" ] && [ -n "$(tail -c1 "$1")" ] && printf '\n' >> "$1"
    return 0
}

# ── ① .env — where the token goes ───────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    : > "$ENV_FILE"
    add "created $ENV_FILE"
fi

if grep -q "^${KEY}=" "$ENV_FILE"; then
    if [ -n "$(sed -n "s/^${KEY}=//p" "$ENV_FILE" | head -1)" ]; then
        ok "$ENV_FILE already has $KEY"
    else
        warn "$KEY in $ENV_FILE is empty — publishing needs a value"
    fi
else
    ensure_newline "$ENV_FILE"
    cat >> "$ENV_FILE" <<'ENVEOF'

# Cadeplay developer token — issue one at https://cadeplay.com/console/tokens
# 🛑 It is shown only once. Paste it below at that moment.
CADEPLAY_TOKEN=
ENVEOF
    add "added a $KEY slot to $ENV_FILE — fill it in"
fi

# ── ② .gitignore — so the file never leaves ─────────────────
#
# Ignoring only `.env` while leaving `.env.local` and friends open means it
# eventually leaks through one of those. `.env.example` is excepted because it
# holds no values.
if [ -f "$GITIGNORE" ] && grep -qE '^\.env($|[*.])' "$GITIGNORE"; then
    ok "$GITIGNORE already ignores $ENV_FILE"
else
    [ -f "$GITIGNORE" ] || : > "$GITIGNORE"
    ensure_newline "$GITIGNORE"
    cat >> "$GITIGNORE" <<'GITEOF'

# The Cadeplay token lives here. Never commit it.
.env
.env.*
!.env.example
GITEOF
    add "added $ENV_FILE to $GITIGNORE"
fi

# ── ③ .env.example — tells teammates what to fill in ────────
if [ -f "$EXAMPLE_FILE" ]; then
    grep -q "^${KEY}=" "$EXAMPLE_FILE" || {
        ensure_newline "$EXAMPLE_FILE"
        printf '\n# https://cadeplay.com/console/tokens\n%s=\n' "$KEY" >> "$EXAMPLE_FILE"
        add "added $KEY to $EXAMPLE_FILE"
    }
    ok "$EXAMPLE_FILE present"
else
    cat > "$EXAMPLE_FILE" <<'EXEOF'
# This file is committed — never put values in it.
# Copy it to `.env` and put the real values there.

# https://cadeplay.com/console/tokens
CADEPLAY_TOKEN=
EXEOF
    add "created $EXAMPLE_FILE (no values · safe to commit)"
fi

# ── ④ 🛑 is it already tracked? ─────────────────────────────
#
# `.gitignore` only applies to files git is **not** already tracking. A `.env`
# that was once `git add`ed keeps getting committed, and that fact appears
# nowhere. If this script does not catch it, nothing will.
TRACKED=0
if git rev-parse --git-dir > /dev/null 2>&1; then
    if git ls-files --error-unmatch "$ENV_FILE" > /dev/null 2>&1; then
        TRACKED=1
        printf '\n  \033[31m🛑 %s is already tracked by git.\033[0m\n' "$ENV_FILE"
        printf '     Editing .gitignore will not stop a tracked file from being committed.\n\n'
        printf '       git rm --cached %s\n\n' "$ENV_FILE"
        printf '     If it was already pushed, treat that token as leaked —\n'
        printf '     revoke it at https://cadeplay.com/console/tokens and issue a new one.\n'
    else
        ok "$ENV_FILE is not tracked"
    fi
else
    warn "not a git repository — $GITIGNORE was created anyway"
fi

# ── what to do next ─────────────────────────────────────────
#
# Do not tell someone who already has a token to go and issue one. Guidance
# that does not match the situation teaches people to stop reading it.
if [ -n "$(sed -n "s/^${KEY}=//p" "$ENV_FILE" | head -1)" ]; then
    printf '\nReady. To use it in a shell:  set -a; . ./%s; set +a\n\n' "$ENV_FILE"
else
    printf '\nNext:\n'
    printf '  1. Issue a token at https://cadeplay.com/console/tokens\n'
    printf '     (publishing needs only uploads:write and builds:write)\n'
    printf '  2. Paste it after %s= in %s\n' "$KEY" "$ENV_FILE"
    printf '  3. To use it in a shell:  set -a; . ./%s; set +a\n\n' "$ENV_FILE"
fi

exit $TRACKED

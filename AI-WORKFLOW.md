# AI-WORKFLOW.md

My working discipline for AI-assisted development. Drop at repo root or `docs/`.

**This is not `CLAUDE.md`.** That file is instructions *for the model* — stack, schema, conventions. This is instructions *for me*. Different audience. Keep both.

**How to read it:** §0 once, to pick the mode. §1 before every task, 20 seconds. §4 once per new repo. §7 when I'm looping. The rest is lookup.

Tags: `[V1]` tooling/Lindquist · `[V2]` design workflow · `[V3]` Hamilton/career · `[V4]` architect mindset · `[V5]` Titus (video + christitus.com/my-ai-workflow) · `[+]` mine, not in any source.

---

## 0. How much of this applies

The gates never change. The machinery scales with how long the code has to live and who else has to live with it. Pick the mode before anything else.

| Mode | Code lives | Bring |
|---|---|---|
| **Take-home / assessment** | Days | Gates in my head only. No setup. Often no AI at all — check the rules first, and proctored means no. |
| **My own project** | Years, I maintain it | All of it. My repo, free tooling, no one to annoy. |
| **Someone else's repo** | Years, others maintain it | My habits. Their machinery. Never import my own process into their codebase. |

> The process structure is replaceable. The gates are not. `[V5]`

The four gates, in every mode: **something defines done before I start · something mechanical checks the work · something independent reviews it · I decide to merge.**

---

## 1. The per-task loop

```
[ ] 1. PLAN      — Milestone + the "why", my words, in a file.
[ ] 2. DONE      — Acceptance criteria written. How do I know it worked?
[ ] 3. OPTIONS   — Unsure? "Two options with trade-offs." Never "what's best?"
[ ] 4. REVIEW    — It wrote an implementation plan. I read it BEFORE any code.
[ ] 5. SCOPE     — One unit: one function, one test, one try/catch, one split.
[ ] 6. CONTEXT   — I named the 2-4 specific files. It is not searching the repo.
[ ] 7. SPEC      — Prompt names a file, a schema, a pattern. Not a feeling.
[ ] 8. MACHINE   — Format, lint, typecheck, tests, build. All green.
[ ] 9. OUTSIDE   — Something that didn't write it reviewed it.
[ ] 10. ME       — I read the diff. I can answer "why this pattern?"
[ ] 11. COMMIT   — Atomic commit for this sub-milestone.
```

The steps that get skipped, and why they matter:

- **1 — PLAN.** If I can't write the sentence, I'm not ready to prompt, I'm hoping. `[V3]`
- **2 — DONE.** "You've got to let it know when it succeeds." Every source says plan; only one says define done. Without it the model decides what finished means. `[V5]`
- **4 — REVIEW.** Bad plan → bad code, always. Two minutes here, an hour saved there. `[V4]`
- **6 — CONTEXT.** Deciding which files are relevant *is* the engineering skill. The friction is the point, and repo-crawling is the biggest token sink there is. `[V4]`
- **10 — ME.** The machine gate proves the code is internally consistent. It cannot tell me the abstraction is wrong, the query is N+1, or the feature does the wrong thing correctly. `[V3][V4]`
- **11 — COMMIT.** Commit ≠ merge. A checkpoint is not an approval. `[+]`

---

## 2. Prompt rules

**Hard rule: no prompt without a noun from my codebase in it.** No file, schema, pattern or type — don't send it.

```
BAD   This component is too big, make it smaller and make it look real.

GOOD  Refactor this component into three smaller sub-components.
      Update the data fetching logic to use our existing API schema.
      Use mock data structures consistent with our `users` table
      to populate the dashboard.
```

Banned openers — each one is me hoping instead of specifying:
"make it better" · "fix this" · "make it look real" · "clean this up" · "that's not right, try again"

Ask for **options, not opinions.** "Two approaches with trade-offs" keeps the decision mine. "What's the best way?" hands it over and hides that I did. `[V4]`

---

## 3. What to delegate

**Delegate — retrieval or pattern-matching, and I can verify it:**

- Boilerplate where an example already exists in this repo `[V3]`
- Unit tests for a function I wrote
- Tracing file history, import graphs, what depends on what `[V1]`
- Summarizing risk in unfamiliar code — as **evidence, not verdicts** `[V1]`
- Numerical reading order for accessibility (mechanical DOM property) `[V2]`
- N variations of one isolated UI component `[V2]`
- **Code review of code something else wrote** `[V5]`

**Don't delegate — judgment with no ground truth to check against:**

- What to build, and why `[V3]`
- Long-horizon architecture — what this system should become `[V3]`
- Whether a trade-off is worth it
- Anything where, if the answer were wrong, I'd have no way to notice `[+]`

> **Investigator, not decider.** Spot-check one claim against the source before trusting the other nine. `[+]`

---

## 4. New project setup

Once per repo. Guardrails go in **before** features — that ordering is the whole point. `[V5]`

```
[ ] CLAUDE.md          stack, schema, branch naming, testing philosophy, conventions
[ ] Pinned versions    exact versions, current LTS, written down
[ ] SPEC               problem, users, behavior, architecture, non-goals,
                       security requirements, acceptance criteria
[ ] ROADMAP            phases, each with an explicit exit criterion
[ ] Test harness       built and verified BEFORE the first feature
[ ] Architecture map   Mermaid, in Markdown, committed
[ ] Stop hook          format + lint + typecheck + test on finish
[ ] Alias              one short command for the pre-configured session
[ ] Dependabot         on
[ ] CodeQL             on
[ ] Dependency review  on
[ ] Regeneration       map rebuilt by the hook — or not committed at all
```

**Pin the versions. `[V5]`** Models reach for whatever appeared most in training, which means old packages with known CVEs. Write the exact version in the spec — and I won't know the current LTS off the top of my head, so look it up.

**Test harness first. `[V5]`** Building the thing that checks the work before building the work is the difference between having guardrails and hoping. This is the step almost everyone skips.

**The map. `[V1]`** Markdown-with-Mermaid is machine-readable as context and human-readable as documentation — same file does onboarding and prompting. The map worth having is the **decision flow** (what happens to a record as it moves through the system), not the folder structure. Folder diagrams rot the first time I move a file; domain-rule diagrams almost never change. `[+]`

**Regeneration. `[+]`** A stale map is *worse than no map* — the model trusts it and reasons confidently from a structure I no longer have.

**The ordering rule on automation. `[+]`**

> Automate a step only after I've done it manually enough times to be bored by it.

Boredom means the judgment is internalized. A hook running `tsc` is safe on day one. A CLI that generates UI "to set constraints" is not, because I have to have the opinions about those constraints first — and generating past them means I never form them. This is the one place the sources genuinely conflict, and at my stage the career side wins.

---

## 5. The review gate

Three passes, in order. Spend more effort here than on generation. `[V5]`

**5a — Machine.** Local, before the PR: `[V5]`

```bash
git diff --check          # whitespace, conflict markers
npm run format
npm run lint
npm run test              # focused first, then the full suite
npm run build             # the production artifact must actually build
```

**5b — Independent.** Something that did *not* write the code reviews it. `[V5]`
A different model, a review bot on the PR, or a human. Not a fresh session of the same agent — same model, same blind spots.

> ⚠️ Rubber-stamping an AI reviewer is the same failure as rubber-stamping an AI coder, one level up. The arbitration *is* the skill: read every comment and overrule the ones that are wrong, too verbose, or don't apply. If I'm accepting everything the reviewer says, I've added cost and removed nothing. `[+]`

**5c — Me. The manual gate.** `[V5]`

```
[ ] Diff contains only the intended changes
[ ] CI is green ON THE LATEST COMMIT, not an older one
[ ] Independent review complete, threads resolved
[ ] Documentation matches the new behavior
[ ] I ran it in the real target environment and looked at it
[ ] I can explain why every non-obvious line is there
```

> "A green check from an older commit does not prove the latest review fix is safe." `[V5]`
> "That pause is the difference between using AI as an assistant and letting it run the project." `[V5]`

**Keep PRs small.** Faster to understand, cheaper to review, easier to revert — and a big PR can take a review bot 20–30 minutes. `[V5]`

---

## 6. Front-end lane

Same loop, UI-specific moves at steps 5 and 10.

**Step 5 (SCOPE) → modular widget generation `[V2]`**
1. Never prompt for a whole page. Isolate the single most critical component.
2. Ask for **≥8 distinct variations of just that widget** — forces exploration of layout, data viz and interaction without a full page dragging it toward mush.
3. Pick the winner → screenshot → rebuild as an editable component → **build the page around that proven foundation by hand.**

Eight here, two in §2, because a visual variation costs nothing and taste needs comparison, while an architectural option needs real reasoning and asking for eight gets five padded ones.

**Step 10 (ME) gains two checks the machine can't do:**

*Persona audit `[V2]`* — a "flow home base" with the key prototypes; have a browsing agent walk them **as a specific persona** (a time-constrained financial advisor, not "a user"), flagging hesitation points and scoring confidence 1–5.

> ⚠️ Blind-spot finder, **not user research.** The score isn't calibrated against anything and a model can't be confused or annoyed the way a person can. Use it to catch the obvious before spending a real person's time. Never report it upward as validation. `[+]`

*Accessibility `[V2]`* — visual layout ≠ screen reader flow. Ask for an explicit numerical reading order, apply it with the Web Accessibility Annotation Kit in Figma. Handoff moves from intuitive guessing to structured documentation.

---

## 7. When it goes wrong

**Trigger — any one, stop immediately:**
- Two failed fix attempts on the same problem. Count them.
- I've typed "no, that's wrong" three times.
- I'm in the "fix this, now fix that, that looks wrong" recursion. `[V4]`

**Procedure — in this order. Half of it fails.**

```
1. REVERT   git reset to the last clean commit.            [V4]
2. EXPORT   dump the conversation.                          [V1]
3. AUDIT    a DIFFERENT model critiques the path taken.     [V1]
4. RESTART  new session, sharper prompt from the audit.  [V1][V4]
```

Revert without the audit → same flawed prompt, same loop in ten minutes.
Audit without the revert → good plan on a corrupted working tree.

Every extra turn arguing with a drifted session adds context reinforcing the wrong direction. I'm not correcting it, I'm training it on the mistake.

---

## 8. Habits

The tooling is the easy half. None of these require installing anything.

1. Write the milestone before opening the chat. One sentence, my words, in a file.
2. No prompt without a noun from my codebase in it.
3. Two strikes and revert. Count out loud.
4. Read every diff before accepting. Not skim — read.
5. **Explain-it-back test.** After each merged unit: close the chat, explain what it does and why that pattern, to nobody. Can't → I don't own it → go read it.
6. Commit more often than feels necessary.
7. Ask for options, not opinions.
8. Automate only what I'm already bored of.
9. When I type "no, that's wrong" a third time, stop typing.
10. **Overrule the reviewer at least sometimes.** If I never disagree with it, I'm not reviewing, I'm forwarding. `[+]`
11. **Stop shopping for a better workflow.** Run this one until something in it actually fails, then fix that one thing. `[+]`

---

## 9. Why — the reasoning, condensed

Reference only. Don't need this to use the doc.

| Apparent conflict | Resolution |
|---|---|
| Hooks auto-approve vs. review every line | Hook gates **mechanical** correctness, I gate **semantic**. The auto-commit automated *checkpointing*, not *review*. |
| Preload big context vs. hand-pick minimal | Different axes. **Map broad, working set narrow.** Both stop repo crawling. |
| 8 variations vs. 2 options vs. don't let it plan | Proposing ≠ deciding. Only the second is forbidden. Count scales to cost-per-option. |
| "Can't do architecture" vs. "summarize architectural impact" | Investigator vs. decider. What exists is checkable; what should exist isn't. |
| Two different reset rituals | Two halves of one procedure — one resets code, one resets reasoning. |
| Heavy AI review vs. "don't lose the ability to explain your code" | Compatible **only if I arbitrate.** Accepting every review comment is the same abdication, one level up. |
| Build the rig vs. build the skill | **Real conflict.** Senior automation encodes judgment already in the head. Same rig without it automates away the reps that produce it. Ordering constraint. |
| ~20% speedup vs. implied 10x | Different task classes. Boilerplate with an existing pattern: large gains. Novel architecture, unfamiliar debugging: often net negative. Measure it, don't estimate it. |

**Cost reality:** this workflow spends more compute on review and validation than on generation — a twelve-line change can be examined by several agents and CI jobs. Heavy use needs a $100–200/month plan, and current pricing is subsidized and won't last. Don't build a process that depends on one model, one subscription, or one plugin. `[V5]`

**The one line:** every technique here is a mechanism for keeping a decision with me that would otherwise drift to the model.

**The other one line:** take the LLM out of this and it's still just good software engineering — specs, tests, small units, review, CI, atomic commits. The AI-specific layer is thin. That's why the guides all agree on the boring parts and differ on the interesting ones, and why the boring parts are the ones that matter. `[V5]`

---

## Appendix A — Stop hook

Claude Code, `.claude/settings.json`. Verify against `code.claude.com/docs/en/hooks`; the schema moves between versions.

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/check.sh",
        "timeout": 45,
        "statusMessage": "Typecheck + tests..."
      }
    ]
  }
}
```

Exit 0 with a `systemMessage` feeds failures back non-blockingly; exit 2 blocks the stop and forces the turn to continue.

```bash
#!/bin/bash
cat > /dev/null   # consume stdin hook JSON

out=$(npm run -s typecheck 2>&1) || {
  jq -n --arg e "$(echo "$out" | head -30)" \
    '{hookSpecificOutput:{hookEventName:"Stop",
      systemMessage:("Typecheck failed. Fix these first:\n\n" + $e)}}'
  exit 0
}
exit 0
```

No automatic loop detection exists. If the same error recurs, have the script bail (flag file or counter) rather than feeding it back forever.

Commit-on-green, only once the checks are trustworthy:

```bash
git add -A && git commit -m "checkpoint: $(date +%H:%M)" --no-verify
```

Working branch only. Squash before merge.

---

## Appendix B — CLAUDE.md skeleton

```markdown
# CLAUDE.md

## Stack
<!-- runtime, framework, styling, state, data layer, hosting — WITH VERSIONS -->

## Vocabulary
<!-- the domain terms that get confused. the single highest-value section. -->

## Data model
<!-- tables/collections + relationships, or link to the schema file -->

## Architecture
<!-- layering rules + link to the Mermaid decision-flow map -->

## Conventions
- Branches:
- Commit format:
- File/folder structure:
- Tests:

## Do not
<!-- patterns already rejected, and why -->
```

**Vocabulary** and **Do not** are the two sections that end repeated arguments, and both are the ones always left out. Every time I reject an approach in a session, one line goes in "Do not" — otherwise I re-litigate it in the next session.

---

## Appendix C — SPEC / ROADMAP skeleton `[V5]`

`SPEC.md` — what this is, before any code:

```markdown
## Problem
## Intended users
## Required behavior
## User experience
## Architecture and major components
## Security and privacy requirements
## Supported versions
<!-- pinned, exact, current LTS -->
## Non-goals
<!-- what this deliberately will not do -->
## Acceptance criteria
<!-- each one testable. this is how "done" is defined. -->
```

`ROADMAP.md` — phased, each phase with an exit criterion:

```markdown
## Phase 1 — <name>
Complete when: <explicit, checkable condition>
- [ ] task
- [ ] task

## Phase 2 — <name>
Complete when: ...
```

`TASKS.md` holds the small jobs inside the current phase only. Big review at each phase boundary.

---

<!-- v2. Sources: 4 videos + Titus video/article. Extend as I go — especially
     §4's "Do not" and §8. Next revision after something in here actually
     fails in practice, not after the next video. -->

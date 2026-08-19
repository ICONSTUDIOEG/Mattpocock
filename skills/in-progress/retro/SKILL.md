---
name: retro
description: STUB — not functional. Raw design ideas for a retrospective skill, awaiting a /writing-for-agents pass.
disable-model-invocation: true
---

# Retro (stub)

Not a working skill. This file is raw material for a future `/writing-for-agents` pass — every idea from the design conversation, uncut, none of it yet reduced to steps, reference, branches, or pruned for no-ops. Treat every section below as a candidate, not an instruction. Do not follow this file as a process.

## Premise

- Runs at the end of a conversation: a retrospective on how the conversation went.
- The compound-engineering promise — the process improves over time — without compound engineering's failure mode: models are bad at improving their own behavior unsupervised. Whatever this becomes, it proposes; it never applies.
- The opportunity: tie together four things this codebase already has, in one pass — steering files (`CLAUDE.md`/`AGENTS.md`), `CODING_STANDARDS.md`, the skills themselves, and the `writing-for-agents` discipline that governs how all three should be written.

## Ideas to fold in — one per raw idea, uncut

1. **Determinism hunt.** Somewhere in the session, the agent (or the user) made a judgment call that had to be made every time — a piece of reasoning repeated rather than automated. Flag these as their own category, distinct from `CODING_STANDARDS.md` prose: a determinism candidate isn't a rule to remember, it's a rule to stop needing — a lint rule, a script, a hook, a type, a tool.
2. **CLAUDE.md → CODING_STANDARDS.md migration.** Steering instructions that have accreted in `CLAUDE.md` belong in `CODING_STANDARDS.md` instead. Retro should actively look for steering prose sitting in the wrong file and propose *moving* it, not just propose new rules.
3. **Branches, from `writing-for-agents`.** Apply the branch vocabulary (a branch = a distinct case a document handles) to the documents retro touches. E.g. a "review branch": when reviewing a piece of code, name the distinct cases its behavior handles, and check the standards file covers each as its own branch rather than one blurred rule.
4. **Tool economy.** Opinions on tool calls and tool setups: find tools that were expensive this session — many calls, high latency, high token cost, retries — by reading the actual session JSONL, not impressions, and propose cheaper tool setups.
5. **Navigation pointers.** Look for hard-to-reach parts of the codebase this session struggled to find — places that needed a highway pointer in `CLAUDE.md`/`AGENTS.md` and didn't have one — and propose adding them.
6. **Codebase design.** Apply the `codebase-design` deep-module/deletion-test vocabulary to flag shallow modules or deletion-test failures the session bumped into — same lens as `/improve-codebase-architecture`, but sourced from this session's actual friction rather than a cold scan.
7. **Prune, not just add.** Any pass over `CODING_STANDARDS.md` should also run the deletion test against *existing* rules and propose removals — a retro that only adds becomes exactly the mess this idea exists to prevent.
8. **Architecture — undecided, two competing shapes:**
   - **One skill, several sub-agents** — each lens above (determinism, tool economy, navigation, codebase design, steering-file hygiene) runs as a parallel sub-agent, each pointed at its own reference doc living inside this skill's folder.
   - **One skill, no sub-agents** — the conversation is already fully in context and there's no exploration needed for the single-session case, so just hand the one in-context agent a checklist of lenses and let it work through them directly. Sub-agents may only earn their keep for the multi-session case below, where transcripts genuinely aren't in context yet.
9. **Multi-session mode.** Fan out sub-agents across several past transcripts in the same project before drawing conclusions, so one session's idiosyncrasy doesn't get promoted to a standing rule.
10. **Never writes directly.** Whatever shape this takes, the output is a proposed diff on a branch, landed as a PR — never a direct commit to `CODING_STANDARDS.md`, `CLAUDE.md`, or anywhere else.

## Reference material for the eventual write-up

- `writing-for-agents` — branches, context pointers, information hierarchy, pruning/no-ops vocabulary. The tool this stub is meant to be fed through.
- `codebase-design` — deletion test, deep module vocabulary, for idea 6.
- `code-review` — precedent for the parallel-sub-agent, non-reranked aggregation shape, relevant to idea 8's first option.

## Next step

Run `/writing-for-agents` against this file: pick an information-hierarchy tier for each idea above (in-file step vs in-file reference vs disclosed reference), settle idea 8, and cut whatever turns out to be a no-op once the real process is written.

---
name: superpowers-brainstorming
description: Building a feature or starting from an idea? STOP. Load first for an approved design before code.
---

# Brainstorming Ideas Into Designs

Turn ideas into designs and specs through collaborative dialogue. Understand project context first. Ask questions one at a time to refine. Once you know what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this — todo list, single-function utility, config change, all of them. "Simple" projects breed unexamined assumptions that waste the most work. Design can be short (a few sentences for truly simple ones), but you MUST present it and get approval.

## Checklist

Create a `todo_write` entry for each. Complete in order:

1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time; understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — trade-offs and your recommendation
4. **Present design** — sections scaled to complexity; get user approval after each section
5. **Write design doc** — save to `docs/reasonix/specs/YYYY-MM-DD-<topic>-design.md` and commit
6. **Spec self-review** — inline check for placeholders, contradictions, ambiguity, scope
7. **User reviews written spec** — ask user to review the spec file before proceeding
8. **Transition to implementation** — use **superpowers-writing-plans** skill to create the implementation plan

## Process Flow

```dot
digraph superpowers-brainstorming {
    "Explore project context" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write design doc" [shape=box];
    "Spec self-review (fix inline)" [shape=box];
    "User reviews spec?" [shape=diamond];
    "Use superpowers-writing-plans skill" [shape=doublecircle];

    "Explore project context" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
    "Propose 2-3 approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Write design doc" [label="yes"];
    "Write design doc" -> "Spec self-review (fix inline)";
    "Spec self-review (fix inline)" -> "User reviews spec?";
    "User reviews spec?" -> "Write design doc" [label="changes requested"];
    "User reviews spec?" -> "Use superpowers-writing-plans skill" [label="approved"];
}
```

**Terminal state is using the superpowers-writing-plans skill.** Do NOT invoke any other implementation skill after superpowers-brainstorming. The ONLY skill you invoke next is superpowers-writing-plans.

## The Process

**Understanding the idea:**

- Check current project state first (files, docs, recent commits)
- Assess scope before detailed questions. Multiple independent subsystems (e.g., "platform with chat, file storage, billing, analytics")? Flag immediately. Don't refine a project that needs decomposing first.
- Too large for one spec? Decompose into sub-projects: independent pieces, how they relate, build order. Brainstorm the first through the normal flow. Each gets its own spec → plan → implementation cycle.
- Appropriately-scoped: ask one question at a time
- Prefer multiple-choice — use the `ask` tool. Open-ended fine too.
- One question per message. More exploration needed? Split into more questions.
- Focus on: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 approaches with trade-offs
- Present conversationally. Lead with recommended option; explain why.

**Presenting the design:**

- Once you know what you're building, present it
- Scale each section to complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right
- Cover: architecture, components, data flow, error handling, testing
- Sketch anything visual or structural — ASCII layout, tree, or small fenced diagram. Terminal is the medium; make options legible.
- Go back and clarify when something doesn't make sense

**Design for isolation and clarity:**

- Break into smaller units: one clear purpose, well-defined interfaces, tested independently
- Per unit: what does it do, how do you use it, what does it depend on?
- Understand a unit without reading internals? Change internals without breaking consumers? If not, boundaries need work.
- Smaller, well-bounded units are easier to reason about. A file growing large signals it's doing too much.

**Working in existing codebases:**

- Explore current structure before proposing changes. Follow existing patterns.
- Existing problems affecting the work (file too large, unclear boundaries, tangled responsibilities)? Include targeted improvements — the way a good developer improves code they work in.
- Don't propose unrelated refactoring. Stay focused on the current goal.

## After the Design

**Documentation:**

- Write the validated design (spec) to `docs/reasonix/specs/YYYY-MM-DD-<topic>-design.md` (user preferences override this default)
- Commit the design document to git

**Spec Self-Review** — fresh eyes on the spec:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, vague requirements? Fix them.
2. **Internal consistency:** Sections contradict? Architecture match the feature descriptions?
3. **Scope check:** Focused enough for one implementation plan, or needs decomposition?
4. **Ambiguity check:** Any requirement interpretable two ways? Pick one; make it explicit.

Fix inline. No re-review — fix and move on.

**User Review Gate** — after the spec review loop passes:

> "Spec written and committed to `<path>`. Please review it and let me know if you want any changes before we start writing the implementation plan."

Wait for the user's response. Changes requested? Make them; re-run the spec review loop. Only proceed once the user approves.

**Implementation:**

- Use the **superpowers-writing-plans** skill to create a detailed implementation plan
- Do NOT invoke any other skill. superpowers-writing-plans is the next step.

## Key Principles

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** (use the `ask` tool) — easier than open-ended
- **YAGNI ruthlessly** — cut unnecessary features from all designs
- **Explore alternatives** — always propose 2-3 approaches before settling
- **Incremental validation** — present design, get approval before moving on
- **Be flexible** — clarify when something doesn't make sense

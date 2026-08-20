---
name: superpowers-brainstorming
description: Building a feature or starting from an idea? STOP. Load first for an approved design before code.
---

# Brainstorming Ideas Into Designs

Turn ideas into designs and specs through collaborative dialogue. Classify how much process the request needs, then work through your path: understand context, refine the idea, present a design, get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have told the user what you intend and they have approved it. This applies to EVERY task on EVERY path below — the ceremony scales with the task; the approval gate never does.
</HARD-GATE>

## Three Paths

Before your first question, classify the request and say the classification out loud — "this looks bounded, so I'll present a short design here rather than write a spec" — so the user can override it:

- **Spike** — a feasibility question ("can we...", "is it possible...", "quick and dirty is fine") whose output is an answer, not code you keep. Present the question and what you'll try in 2-3 sentences, get a nod, then find out as cheaply as correctness allows. No design doc, no spec file. Report findings as a recommendation; anything you built stays labeled throwaway.
- **Bounded** — a well-scoped change to code that already exists in this repo: a new flag, a small endpoint, a one-file fix. Understanding the kind of app is not enough — bounded means the flow you are changing is already here to read. If there is no existing flow to change, the task is not bounded. Ask the clarifying questions that matter, present a short design IN CHAT (a few sentences to a few short paragraphs), and STOP. Implementation starts only after the user says yes to that design — a bounded task's approval is as hard a gate as an architectural one. No spec file, no implementation plan document.
- **Architectural** — new projects, new subsystems, changes that restructure how components fit together or alter interfaces others depend on. Follow the full process below: questions, approaches, sectioned design, written spec, then the **superpowers-writing-plans** skill.

When in doubt between two paths, take the heavier one. The ratchet is one-way: hidden complexity discovered mid-task upgrades the path — stop, say so, and step up. Nothing downgrades mid-task.

## Anti-Pattern: "Too Simple To Need Approval"

Every path ends with the user approving your intent before implementation. A todo list, a single-function utility, a config change — the design may be two sentences in chat, but you MUST present it and get approval. "Simple" tasks are where unexamined assumptions cause the most wasted work. What scales with simplicity is the artifact, never the approval.

## Red Flags

| Thought | Reality |
|---------|---------|
| "This is too simple to need a design" | Simple means a short design, not no design. Two sentences in chat, then approval. |
| "I'll call it bounded and skip the spec" | Reaching for a label to skip work IS the doubt — take the heavier path. |
| "It's bounded and the design is obvious — I'll start while they read it" | The gate is the approval, not the design's length. Present, then stop until you hear yes. |
| "I understand this kind of app, so it's bounded" | Bounded measures the repo, not your familiarity. A new project has no existing flow — it is architectural. |
| "The spike works, so I'll keep the code" | A spike's output is an answer. Keeping the code is a new request — classify it. |
| "It grew, but I'm almost done — no need to re-classify" | Hidden complexity upgrades the path mid-task. Stop and say so. |
| "They approved the spike, so the follow-up change is approved too" | Each task gets its own classification and its own approval. |

## Checklist

Classify first, announce the path, then create a `todo_write` entry for each item on your path and complete them in order.

**Spike:**
1. **Explore project context** — enough to frame the probe
2. **Present question + probe plan** — 2-3 sentences
3. **Get approval** — a nod is enough
4. **Investigate** — as cheaply as correctness allows
5. **Report findings** — a recommendation; label anything built as throwaway

**Bounded:**
1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time, the ones that matter
3. **Present short design in chat** — approach, files touched, testing
4. **Get approval** — STOP and wait for an explicit yes; presenting the design and starting in the same breath is skipping the gate
5. **Implement** — proceed with the normal development workflow (**superpowers-test-driven-development** applies); no plan document

**Architectural:**
1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — trade-offs and your recommendation
4. **Present design** — sections scaled to complexity; get user approval after each section
5. **Write design doc** — save to `docs/reasonix/specs/YYYY-MM-DD-<topic>-design.md` and commit
6. **Spec self-review** — inline check for placeholders, contradictions, ambiguity, scope
7. **User reviews written spec** — ask user to review the spec file before proceeding
8. **Transition to implementation** — use **superpowers-writing-plans** skill to create the implementation plan

## Process Flow

```dot
digraph superpowers-brainstorming {
    "Classify: spike / bounded / architectural" [shape=diamond];
    "Present question + probe (2-3 sentences)" [shape=box];
    "Ask clarifying questions (bounded)" [shape=box];
    "Present short design in chat" [shape=box];
    "User approves?" [shape=diamond];
    "Investigate; report recommendation" [shape=doublecircle];
    "Implement via normal workflow (no plan doc)" [shape=doublecircle];
    "Explore project context" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write design doc" [shape=box];
    "Spec self-review (fix inline)" [shape=box];
    "User reviews spec?" [shape=diamond];
    "Use superpowers-writing-plans skill" [shape=doublecircle];
    "Hidden complexity? Upgrade path" [shape=box];

    "Classify: spike / bounded / architectural" -> "Present question + probe (2-3 sentences)" [label="spike"];
    "Classify: spike / bounded / architectural" -> "Ask clarifying questions (bounded)" [label="bounded"];
    "Classify: spike / bounded / architectural" -> "Explore project context" [label="architectural"];
    "Present question + probe (2-3 sentences)" -> "User approves?";
    "Ask clarifying questions (bounded)" -> "Present short design in chat";
    "Present short design in chat" -> "User approves?";
    "User approves?" -> "Investigate; report recommendation" [label="spike: yes"];
    "User approves?" -> "Implement via normal workflow (no plan doc)" [label="bounded: yes"];
    "Hidden complexity? Upgrade path" -> "Classify: spike / bounded / architectural";
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

**Terminal states are path-bound.** Architectural: the ONLY skill you invoke after brainstorming is **superpowers-writing-plans** — never any other implementation skill. Bounded: after approval, implementation proceeds directly through the normal development workflow; no plan document. Spike: the terminal state is a reported recommendation.

## The Process

The subsections below serve the bounded and architectural paths (a spike stops at "present the probe, get a nod"). Sections from **Exploring approaches** onward are architectural-path depth — for bounded work, context plus a few questions plus a short in-chat design is the whole process.

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

## After the Design (architectural path)

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

- **Classify first** — spike, bounded, or architectural; say it out loud
- **One question at a time** — don't overwhelm
- **Multiple choice preferred** (use the `ask` tool) — easier than open-ended
- **YAGNI ruthlessly** — cut unnecessary features from all designs
- **Explore alternatives** — always propose 2-3 approaches before settling (architectural path)
- **Incremental validation** — present design, get approval before moving on
- **Be flexible** — clarify when something doesn't make sense
- **Ratchet, don't downgrade** — hidden complexity upgrades the path; nothing downgrades mid-task

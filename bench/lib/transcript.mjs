// Tools whose invocation means "a skill was loaded".
export const SKILL_TOOLS = new Set(['run_skill', 'read_skill']);
// Dedicated wrappers that ARE a skill (the skill name is the tool name).
export const WRAPPER_TOOLS = new Set(['explore', 'review', 'research', 'security_review']);

/**
 * Parse a Reasonix session JSONL transcript into the ordered list of skills invoked.
 * @param {string} jsonlText
 * @returns {string[]} skill names, in invocation order (duplicates preserved)
 */
export function extractSkillInvocations(jsonlText) {
  const invocations = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (obj.role !== 'assistant' || !Array.isArray(obj.tool_calls)) continue;
    for (const tc of obj.tool_calls) {
      const fn = tc && tc.function;
      if (!fn || !fn.name) continue;
      if (SKILL_TOOLS.has(fn.name)) {
        try {
          const args = JSON.parse(fn.arguments || '{}');
          if (args && typeof args.name === 'string') invocations.push(args.name);
        } catch { /* unparseable args: skip this call */ }
      } else if (WRAPPER_TOOLS.has(fn.name)) {
        invocations.push(fn.name);
      }
    }
  }
  return invocations;
}

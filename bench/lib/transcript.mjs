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
      if (!tc) continue;
      // Reasonix's npm build uses a FLAT tool-call shape: {id, name, arguments}.
      // Tolerate the OpenAI-nested shape {function:{name, arguments}} as a fallback.
      const name = tc.name ?? tc.function?.name;
      const rawArgs = tc.arguments ?? tc.function?.arguments;
      if (!name) continue;
      if (SKILL_TOOLS.has(name)) {
        try {
          const args = JSON.parse(rawArgs || '{}');
          if (args && typeof args.name === 'string') invocations.push(args.name);
        } catch { /* unparseable args: skip this call */ }
      } else if (WRAPPER_TOOLS.has(name)) {
        invocations.push(name);
      }
    }
  }
  return invocations;
}

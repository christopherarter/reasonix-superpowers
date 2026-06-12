/**
 * Walk a Reasonix session JSONL and return tool calls in order, each paired
 * with its result text. Handles the flat shape {id,name,arguments} and the
 * nested OpenAI {function:{name,arguments}} shape.
 * @returns {Array<{ name:string, args:object, resultText:string, id:string }>}
 */
export function extractToolCalls(jsonlText) {
  const calls = [];
  const results = new Map(); // tool_call_id -> content
  const lines = jsonlText.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.role === 'tool' && o.tool_call_id) results.set(o.tool_call_id, String(o.content ?? ''));
  }

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.role !== 'assistant' || !Array.isArray(o.tool_calls)) continue;
    for (const tc of o.tool_calls) {
      if (!tc) continue;
      const name = tc.name ?? tc.function?.name;
      const rawArgs = tc.arguments ?? tc.function?.arguments;
      if (!name) continue;
      let args = {};
      try { args = JSON.parse(rawArgs || '{}'); } catch { args = {}; }
      const id = tc.id ?? '';
      calls.push({ name, args, id, resultText: results.get(id) ?? '' });
    }
  }
  return calls;
}

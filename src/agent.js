import config from "./config.js";
import { getAI, initAI } from "./ai.js";
import { registry as toolRegistry } from "./tools.js";

export const AGENT_SYSTEM = `You are Madellin, an autonomous assistant that can take real actions using tools.

How to work:
- Break the user's request into steps and call tools one at a time, waiting for each result.
- Only call a tool when it is genuinely useful. Use web_search before guessing facts you are unsure about.
- If a tool errors, try a reasonable alternative or clearly tell the user what happened.
- Never invent or fabricate tool results, page contents, or data.
- When the task is done, give a concise final answer in the user's language (mostly Persian).

Tool safety:
- Some tools are owner-only. If a requested action is not available to you, say so politely.
- Never expose secrets or private data you are not asked about.`;

export async function runAgent(
  task,
  { userId = 0, allowTools = null, extraTools = [], maxRounds = config.maxAgentRounds } = {}
) {
  if (!config.geminiKey) throw new Error("NO_GEMINI_KEY");
  const ai = getAI() || initAI();

  const available = [...toolRegistry.values(), ...extraTools].filter((t) => {
    if (allowTools && !allowTools.includes(t.name)) return false;
    if (t.allowedFor) return t.allowedFor(userId);
    return !t.needsApproval || (config.ownerId && userId === config.ownerId);
  });
  if (!available.length) throw new Error("NO_TOOLS");

  const declarations = available.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters || { type: "object", properties: {} },
  }));
  const toolNames = available.map((t) => t.name).join(", ");

  const contents = [{ role: "user", parts: [{ text: String(task).slice(0, 20000) }] }];

  for (let round = 0; round < maxRounds; round++) {
    const res = await ai.models.generateContent({
      model: config.model,
      contents,
      systemInstruction: AGENT_SYSTEM + `\n\nTools available in this session: ${toolNames}`,
      config: {
        tools: [{ functionDeclarations: declarations }],
        automaticFunctionCallingConfig: { disable: true },
      },
    });

    const rawParts = (res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts) || [];
    const modelParts = rawParts.filter((p) => p.text || p.functionCall);
    const calls = modelParts.filter((p) => p.functionCall).map((p) => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {},
      part: p,
    }));

    if (!calls.length) {
      const text = (modelParts.filter((p) => p.text).map((p) => p.text).join("") || "").trim();
      return { text: text || "(no output)", rounds: round + 1 };
    }

    contents.push({ role: "model", parts: modelParts });

    for (const call of calls) {
      const tool = available.find((t) => t.name === call.name);
      let response;
      if (!tool) {
        response = { error: "Unknown tool: " + call.name };
      } else {
        try {
          const result = await tool.handler.call({ userId }, call.args);
          response = { result };
        } catch (e) {
          response = { error: String((e && e.message) || e) };
        }
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response } }] });
    }
  }

  const lastModel = contents.filter((c) => c.role === "model").pop();
  const finalText =
    (lastModel &&
      lastModel.parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join("\n")) ||
    "Reached the maximum number of tool rounds without a final answer.";
  return { text: finalText.trim(), rounds: maxRounds };
}

import { Store } from "./src/store.js";
import { MemoryStore } from "./src/memory.js";
import { registry } from "./src/utils.js";

import registerCore from "./src/commands/core.js";
import registerAi from "./src/commands/ai.js";
import registerText from "./src/commands/text.js";
import registerMath from "./src/commands/math.js";
import registerDatetime from "./src/commands/datetime.js";
import registerWeb from "./src/commands/web.js";
import registerFun from "./src/commands/fun.js";
import registerGames from "./src/commands/games.js";
import registerPersonal from "./src/commands/personal.js";
import registerGroup from "./src/commands/group.js";
import registerProductivity from "./src/commands/productivity.js";
import registerFinance from "./src/commands/finance.js";
import registerHealth from "./src/commands/health.js";
import registerKnowledge from "./src/commands/knowledge.js";
import registerDev from "./src/commands/dev.js";
import registerExtra from "./src/commands/extra.js";

const store = new Store(process.env.STORE_TEST || "data/store.json");
const memory = new MemoryStore("data/memory.json");
const deps = { store, memory };

const handlers = {};
const fakeBot = {
  command: (name, fn) => { handlers[name] = fn; },
  on: () => {},
};

registerCore(fakeBot, deps);
registerAi(fakeBot, deps);
registerText(fakeBot);
registerMath(fakeBot);
registerDatetime(fakeBot);
registerWeb(fakeBot);
registerFun(fakeBot);
registerGames(fakeBot);
registerPersonal(fakeBot, deps);
registerGroup(fakeBot, deps);
registerProductivity(fakeBot, deps);
registerFinance(fakeBot, deps);
registerHealth(fakeBot, deps);
registerKnowledge(fakeBot);
registerDev(fakeBot);
registerExtra(fakeBot);

const names = Object.keys(handlers).sort();
console.log("Registered commands:", names.length);
console.log("In registry meta:", Object.keys(registry).length);
const missing = names.filter((n) => !registry[n]);
const extra = Object.keys(registry).filter((n) => !handlers[n]);
console.log("Handlers missing meta:", missing.length ? missing : "none");
console.log("Meta without handler:", extra.length ? extra : "none");
process.exit(0);

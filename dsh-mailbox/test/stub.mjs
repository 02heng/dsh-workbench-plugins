// dsh-mailbox e2e：@deepseek-ai/* 的最小替身，只为让 lib/index.js 能 import 成功。
const anyProxy = new Proxy(function () {}, {
  get(_target, key) {
    if (key === "__esModule") return true;
    if (key === "then") return undefined;
    if (typeof key === "symbol") return undefined;
    return anyProxy;
  },
  apply() { return anyProxy; },
  construct() { return anyProxy; },
});

export default anyProxy;
export const defineTool = (definition) => definition;
export const Service = class {};
export const Context = class {};
export const Schema = anyProxy;
export const z = anyProxy;

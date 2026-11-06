// dsh-mailbox e2e：把 DSH 运行时依赖指向本地 stub，便于独立跑（不启动 DSH）。
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@deepseek-ai/")) {
    return { url: new URL("./stub.mjs", import.meta.url).href, shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}

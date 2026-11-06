const $ = (id) => document.getElementById(id);
const state = { config: null, rules: [], busy: false };

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

function log(text, clear) {
  const el = $("log");
  if (!el) return;
  if (clear) el.textContent = "";
  el.textContent += (el.textContent && !clear ? "\n" : "") + "[" + stamp() + "] " + text;
  el.scrollTop = el.scrollHeight;
}

async function api(path, body) {
  const init = body === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch("./api/" + path, init);
  let data;
  try { data = await res.json(); } catch { data = { error: "服务端返回的不是 JSON（HTTP " + res.status + "）" }; }
  if (!res.ok || data.error) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

async function withBusy(button, work) {
  if (state.busy) return;
  state.busy = true;
  const label = button ? button.textContent : "";
  if (button) { button.disabled = true; button.textContent = "执行中…"; }
  try { await work(); }
  catch (error) { log("失败：" + (error?.message ?? error)); }
  finally {
    state.busy = false;
    if (button) { button.disabled = false; button.textContent = label; }
  }
}

function renderStatus(data) {
  const status = data.status || {};
  const badge = $("badge-config");
  badge.textContent = status.configured ? "已配置 " + status.address : "未配置授权码";
  badge.className = "badge " + (status.configured ? "ok" : "warn");
  const schedule = data.schedule || {};
  const times = Array.isArray(schedule.times) && schedule.times.length ? schedule.times.join("、") : "未启用";
  $("badge-schedule").textContent = "定时：" + (schedule.enabled === false ? "已关闭" : times);
  $("card-mail").textContent = status.address || "—";
  $("card-rules").textContent = (data.rules || []).length + " 条";
  $("card-pending").textContent = (data.pendingMails ?? 0) + " 封";
  $("card-last").textContent = status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : "尚未运行";
  if (status.lastRunResult) {
    const r = status.lastRunResult;
    $("card-last").textContent += "（收 " + (r.scanned ?? 0) + " / 归档 " + (r.organized ?? 0) + "）";
  }
}

function fillConfig(config) {
  state.config = config;
  const mb = config.mailbox || {};
  $("address").value = mb.address || "";
  $("imapHost").value = mb.imapHost || "";
  $("imapPort").value = mb.imapPort ?? "";
  $("smtpHost").value = mb.smtpHost || "";
  $("smtpPort").value = mb.smtpPort ?? "";
  $("password").value = "";
  $("password").placeholder = mb.hasPassword ? "已保存（留空不改）" : "126 客户端授权码";
  $("archiveRoot").value = (config.paths || {}).archiveRoot || "";
  $("namingTemplate").value = (config.naming || {}).template || "";
  $("fallbackTarget").value = config.fallbackTarget || "";
  $("scheduleTimes").value = ((config.schedule || {}).times || []).join("，");
  state.rules = (config.rules || []).map((rule) => ({ ...rule }));
  renderRules();
}

function renderRules() {
  const body = document.querySelector("#rules-table tbody");
  body.innerHTML = "";
  state.rules.forEach((rule, index) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(index);
    tr.innerHTML =
      '<td><input data-field="name" value="' + escapeAttr(rule.name || "") + '" placeholder="课间一刻钟" /></td>' +
      '<td><input data-field="keywords" value="' + escapeAttr((rule.keywords || []).join("，")) + '" placeholder="课间一刻钟，一刻钟" /></td>' +
      '<td><input data-field="target" value="' + escapeAttr(rule.target || "") + '" placeholder="留空=归档根目录/通知名" /></td>' +
      '<td><select data-field="bySchool"><option value="1">按学校</option><option value="0">不分学校</option></select></td>' +
      '<td><button class="link" data-action="remove">删除</button></td>';
    body.appendChild(tr);
    tr.querySelector('[data-field="bySchool"]').value = rule.bySchool === false ? "0" : "1";
    tr.querySelector('[data-action="remove"]').addEventListener("click", () => {
      state.rules.splice(index, 1);
      renderRules();
    });
  });
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function collectRules() {
  const rows = document.querySelectorAll("#rules-table tbody tr");
  const out = [];
  rows.forEach((tr, index) => {
    const get = (field) => tr.querySelector('[data-field="' + field + '"]')?.value ?? "";
    const name = get("name").trim();
    const keywords = get("keywords").split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean);
    if (!name && !keywords.length) return;
    const previous = state.rules[index] || {};
    out.push({
      id: previous.id || "rule-" + Date.now() + "-" + index,
      name: name || keywords[0] || "未命名规则",
      keywords,
      target: get("target").trim(),
      bySchool: get("bySchool") !== "0",
      enabled: true,
      prefixSchool: previous.prefixSchool !== false,
    });
  });
  return out;
}

async function refresh() {
  const status = await api("status");
  renderStatus(status);
  const config = await api("config");
  fillConfig(config.config);
  return status;
}

async function saveConnection() {
  const patch = {
    mailbox: {
      address: $("address").value.trim(),
      imapHost: $("imapHost").value.trim(),
      imapPort: Number($("imapPort").value) || 993,
      smtpHost: $("smtpHost").value.trim(),
      smtpPort: Number($("smtpPort").value) || 465,
    },
  };
  const body = { patch };
  const password = $("password").value;
  if (password) body.password = password;
  const result = await api("config", body);
  $("password").value = "";
  log("配置已保存。" + (password ? "授权码写入本机 secret.json。" : ""));
  await refresh();
  return result;
}

async function savePaths() {
  const times = $("scheduleTimes").value.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean);
  await api("config", {
    patch: {
      paths: { archiveRoot: $("archiveRoot").value.trim() },
      naming: { template: $("namingTemplate").value.trim() },
      fallbackTarget: $("fallbackTarget").value.trim() || "inbox/待人工",
      schedule: { times, enabled: times.length > 0 },
    },
  });
  log("落盘与命名配置已保存。");
  await refresh();
}

async function saveRules() {
  const rules = collectRules();
  await api("config", { patch: { rules } });
  log("已保存 " + rules.length + " 条通知规则。");
  await refresh();
}

function renderLedger(data) {
  const box = $("ledger");
  if (!data.rows || !data.rows.length) {
    box.innerHTML = '<p class="hint">' + (data.message || "该月还没有台账记录。") + "</p>";
    return;
  }
  const headers = data.headers.filter(Boolean);
  const head = "<tr>" + headers.map((item) => "<th>" + escapeAttr(item) + "</th>").join("") + "</tr>";
  const rows = data.rows.map((row) => "<tr>" + headers.map((item) => {
    const value = row[item];
    return "<td>" + escapeAttr(Array.isArray(value) ? value.join("；") : value ?? "") + "</td>";
  }).join("") + "</tr>").join("");
  box.innerHTML = '<table><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
}

function summarize(data) {
  if (data.error) return data.error;
  return JSON.stringify(data, null, 2).slice(0, 4000);
}

document.addEventListener("DOMContentLoaded", async () => {
  log("加载配置…", true);
  try { await refresh(); log("就绪。"); }
  catch (error) { log("加载失败：" + error.message); }

  $("btn-save").addEventListener("click", (event) => withBusy(event.currentTarget, saveConnection));
  $("btn-save-paths").addEventListener("click", (event) => withBusy(event.currentTarget, savePaths));
  $("btn-save-rules").addEventListener("click", (event) => withBusy(event.currentTarget, saveRules));

  $("btn-add-rule").addEventListener("click", () => {
    state.rules.push({ id: "rule-" + Date.now(), name: "", keywords: [], target: "", bySchool: true, enabled: true });
    renderRules();
  });

  $("btn-test").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    await saveConnection();
    log("正在测试 IMAP 连接…");
    const data = await api("test", {});
    log("连接成功：" + data.address + "，" + data.folder + " 共 " + data.totalMessages + " 封邮件。");
  }));

  $("btn-scan").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    log("开始收信…");
    const data = await api("scan", {});
    log("收信完成：新收 " + (data.newCount ?? 0) + " 封（邮箱共 " + (data.totalMessages ?? 0) + " 封）。" + (data.note || ""));
    (data.mails || []).forEach((mail) => log(" · " + mail.subject + " ｜ " + (mail.ruleName || "未匹配规则") + " ｜ 附件 " + (mail.attachments || []).length));
    await refresh();
  }));

  $("btn-process").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    log("开始整理归档…");
    const data = await api("process", {});
    log("整理完成：处理 " + data.processed + " 封，归档 " + data.organized + " 封，待人工 " + data.needsHuman + " 封。");
    log("台账：" + data.ledger);
    log("缺件清单：" + data.missingList);
    (data.mails || []).forEach((mail) => log(" · " + mail.subject + " → " + mail.target + "（" + mail.status + "）"));
    await refresh();
  }));

  $("btn-dry").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    const data = await api("process", { dryRun: true });
    log("预览：将处理 " + data.processed + " 封（归档 " + data.organized + "，待人工 " + data.needsHuman + "）");
    (data.mails || []).forEach((mail) => log(" · " + mail.subject + " → " + mail.target));
  }));

  $("btn-run").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    log("一键收取：先收信再整理…");
    const data = await api("run", {});
    log("收信：" + (data.fetched?.newCount ?? 0) + " 封；归档：" + (data.organized?.organized ?? 0) + " 封；待人工：" + (data.organized?.needsHuman ?? 0) + " 封。");
    if (data.organized?.ledger) log("台账：" + data.organized.ledger);
    await refresh();
  }));

  $("btn-ledger").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    const data = await api("ledger");
    renderLedger(data);
    log("台账：" + data.path + "（" + (data.rows || []).length + " 行）");
  }));

  $("btn-selftest").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    log("运行离线自检…");
    const data = await api("selftest", {});
    log(data.ok ? "自检全部通过：" + data.passed + "/" + data.total : "自检失败：通过 " + data.passed + "/" + data.total);
    (data.checks || []).filter((item) => !item.pass).forEach((item) => log(" ✗ " + item.name + " ｜ " + item.detail));
  }));

  $("btn-logs").addEventListener("click", (event) => withBusy(event.currentTarget, async () => {
    const data = await api("logs?tail=80");
    log("运行日志（最近 " + (data.lines || []).length + " 行）：\n" + (data.lines || []).join("\n"));
  }));
});

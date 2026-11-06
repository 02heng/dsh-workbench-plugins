// probe-big4.mjs — 试直接 GET QQ 超大附件下载链接，看返回什么
import fs from 'node:fs';
const URL_ = process.env.BIGURL || fs.readFileSync('D:/dsh-workbench/mail/126/_tmp/bigurl.txt', 'utf8').trim();
const PAGE = 'D:/dsh-workbench/mail/126/_tmp/qq_big.html';

const r1 = await fetch(URL_, {
  headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
  redirect: 'follow',
});
const buf = Buffer.from(await r1.arrayBuffer());
const ct = r1.headers.get('content-type') || '';
const cd = r1.headers.get('content-disposition') || '';
const out = { url: r1.url.slice(0, 160), status: r1.status, ct, cd: cd.slice(0, 160), bytes: buf.length, isHtml: /text\/html/i.test(ct) };
if (/text\/html/i.test(ct)) {
  fs.writeFileSync(PAGE, buf.toString('utf8'), 'utf8');
  const html = buf.toString('utf8');
  out.title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  out.texts = (html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600));
  out.links = [...new Set([...html.matchAll(/https?:\/\/[^"'\s<>]+/g)].map((m) => m[0]))].filter((u) => /ftn|download|cgi-bin/i.test(u)).slice(0, 10);
} else {
  fs.writeFileSync('D:/dsh-workbench/mail/126/_tmp/qq_big.bin', buf);
}
console.log(JSON.stringify(out, null, 1));

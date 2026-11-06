const task = await taskSpace("dsh-126-watch");
const page = task.page("p1");
const names = new Set();
let o = page;
let guard = 0;
while (o && guard < 8) {
  for (const n of Object.getOwnPropertyNames(o)) names.add(n);
  o = Object.getPrototypeOf(o);
  guard += 1;
}
console.log('page members: ' + [...names].filter((n) => !n.startsWith('_')).sort().join(', '));
console.log('typeof page.context=' + typeof page.context + ' typeof page.cookies=' + typeof page.cookies);
console.log('task members: ' + Object.getOwnPropertyNames(Object.getPrototypeOf(task)).join(', '));
if (typeof page.context === 'function') {
  try {
    const ctx = page.context();
    console.log('ctx type=' + typeof ctx);
    if (ctx && typeof ctx.cookies === 'function') {
      const ck = await ctx.cookies('https://mail.126.com/');
      console.log('cookies=' + JSON.stringify(ck.map((c) => ({ n: c.name, httpOnly: c.httpOnly }))));
    }
  } catch (e) {
    console.log('ctx err: ' + e.message);
  }
}

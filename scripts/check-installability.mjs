const url = process.env.PWA_URL || 'http://127.0.0.1:8790/';
const port = process.env.CHROME_PORT || 9228;
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = tabs.find(tab => tab.type === 'page');
if (!page) throw new Error('No hay una pestaña de Chrome con depuración remota');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  if (message.error) task.reject(new Error(message.error.message));
  else task.resolve(message.result);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.navigate', { url });
await new Promise(resolve => setTimeout(resolve, 1500));
const manifest = await send('Page.getAppManifest');
const installability = await send('Page.getInstallabilityErrors');
console.log(JSON.stringify({ url: manifest.url, errors: manifest.errors, installability: installability.installabilityErrors }, null, 2));
socket.close();

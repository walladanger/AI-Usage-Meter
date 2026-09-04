import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const projectRoot = process.cwd();
const distDirectory = path.join(projectRoot, 'dist');
const html = fs.readFileSync(path.join(distDirectory, 'index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+src="([^"]+\.js)"/);
if (!entryMatch) throw new Error('Production bundle entry script was not found.');

const moduleMarker = path.join(distDirectory, 'package.json');
fs.writeFileSync(moduleMarker, '{"type":"module"}\n');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLLinkElement', 'HTMLCanvasElement', 'SVGElement', 'Element', 'Node', 'Event', 'ErrorEvent', 'PromiseRejectionEvent', 'DOMException', 'MutationObserver', 'getComputedStyle']) {
  if (key in dom.window) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.fetch = async () => ({});

dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ canvas: this }, {
    get(target, property) {
      if (property === 'measureText') return (text) => ({ width: String(text).length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'createPattern') return () => null;
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) { target[property] = value; return true; },
  });
};

const appendToHead = document.head.appendChild.bind(document.head);
document.head.appendChild = (node) => {
  const appended = appendToHead(node);
  if (node instanceof dom.window.HTMLLinkElement) setTimeout(() => node.dispatchEvent(new Event('load')), 0);
  return appended;
};

try {
  const entryPath = path.join(distDirectory, entryMatch[1].replace(/^\//, ''));
  await import(pathToFileURL(entryPath).href);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const renderedText = document.getElementById('root')?.textContent ?? '';
  if (!renderedText.includes('Command Center')) {
    throw new Error(`Production bundle did not render the dashboard. Visible output: ${renderedText.slice(0, 500)}`);
  }
  console.log('Production bundle rendered the dashboard.');
} finally {
  fs.rmSync(moduleMarker, { force: true });
  dom.window.close();
}

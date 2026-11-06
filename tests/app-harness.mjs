// Runs the real app event handlers and animation loop without a camera or live UI.
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as simulation from '../dist/simulation.mjs';
import * as scenarios from '../dist/scenarios.mjs';

class Element {
  constructor(tagName = 'DIV') {
    this.tagName = tagName; this.type = ''; this.disabled = false; this.value = '0'; this.style = {}; this.attrs = new Map(); this.events = new Map(); this.children = [];
    const classes = new Set(); this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) };
  }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(fn); }
  emit(name, options = {}) {
    if (this.disabled && ['click', 'pointerdown'].includes(name)) return [];
    const event = { target: this, button: 0, pointerId: 1, detail: 0, code: '', repeat: false, preventDefault() {}, ...options };
    return (this.events.get(name) || []).map(fn => fn(event));
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name); }
  setPointerCapture(id) { this.capturedPointer = id; }
  getBoundingClientRect() { return { x: 0, y: 0, width: 160, height: 160 }; }
  querySelector() { return this.child ||= new Element('SPAN'); }
  replaceChildren(...children) { this.children = children; }
}

export async function appHarness(initialScenario = 'free') {
  const elements = new Map(), document = new Element(), window = new Element();
  const markup = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const match of markup.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const el = new Element(match[1].toUpperCase());
    if (match[0].includes('type="range"')) el.type = 'range';
    elements.set(match[2], el);
  }
  document.getElementById = id => { if (!elements.has(id)) throw new Error(`Missing element ${id}`); return elements.get(id); };
  document.createElement = tag => new Element(tag.toUpperCase()); document.createTextNode = text => ({ textContent: text });
  let device, nextFrame, now = 0, rendered;
  class Hands {
    constructor(callbacks) { this.callbacks = callbacks; this.active = false; this.calibrated = false; this.ready = false; device = this; }
    async start() { this.active = this.calibrated = this.ready = true; this.callbacks.onChange('calibrated'); }
    stop() { this.active = this.calibrated = this.ready = false; this.callbacks.onLost(); this.callbacks.onChange('off'); }
    calibrate() { return true; }
    lose() { this.ready = false; this.callbacks.onLost(); this.callbacks.onChange('lost'); }
    regain(angle = 0) { this.ready = true; this.callbacks.onAngle(angle); this.callbacks.onChange('calibrated'); }
  }
  const context = {
    ...simulation, ...scenarios, document, window, console, HandController: Hands,
    createScene: async () => ({ kind: '3d', render: state => { rendered = structuredClone(state); }, setView() {} }),
    requestAnimationFrame: fn => { nextFrame = fn; return 1; },
    performance: { now: () => now }
  };
  const source = (await readFile(new URL('../dist/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  vm.runInNewContext(source, context, { filename: 'app.mjs' });
  await Promise.resolve();
  function tick(count = 1, stepMs = 1000 / 60) { for (let i = 0; i < count; i++) { now += stepMs; nextFrame(now); } }
  tick();
  if (initialScenario) { elements.get('scenarioSelect').value = initialScenario; elements.get('scenarioSelect').emit('change'); tick(); }
  return {
    el: id => document.getElementById(id), document, window,
    async click(id) { await Promise.all(document.getElementById(id).emit('click')); },
    tick,
    get output() { return rendered; }, get hands() { return device; }
  };
}

// 浏览器环境沙箱模块
function buildSandbox() {
// tdc.js Node 沙箱:补浏览器环境执行 Chaos VM,生成 collect
// 用法: node sandbox.js
const fs = require('fs');
const vm = require('vm');

const UA = 'Mozilla/5.0 (Linux; Android 14; 2106118C Build/UKQ1.231207.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 MQQBrowser/6.2 TBS/047823 Mobile Safari/537.36 QDJSSDK/1.0  QDNightStyle_1  QDReaderAndroid/7.9.420/1656/1002138/Xiaomi/QDShowNativeLoading';

// ---------- 记录缺失环境访问 ----------
const missing = new Set();
function note(k) { if (!missing.has(k)) { missing.add(k); console.error('[missing]', k); } }

// ---------- 事件系统 ----------
function makeEventTarget(name) {
  const listeners = {};
  const et = {
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    dispatchEvent: function (ev) {
      ev.target = ev.target || et;
      ev.currentTarget = et;
      ev.srcElement = et;
      (listeners[ev.type] || []).forEach(fn => { try { fn.call(et, ev); } catch (e) { console.error('[handler err]', ev.type, e.message); } });
      // onxxx 属性处理器
      const on = 'on' + ev.type;
      if (typeof et[on] === 'function') { try { et[on](ev); } catch (e) {} }
      return true;
    },
    _listeners: listeners,
  };
  return et;
}

// ---------- 定时器(虚拟时间,tdc 会大量 setTimeout) ----------
const timers = { seq: 0, map: new Map() };
const ctxTimers = {
  setTimeout: function (fn, ms) { const id = ++timers.seq; timers.map.set(id, { fn, at: Date.now() + (ms || 0) }); return id; },
  setInterval: function (fn, ms) { const id = ++timers.seq; timers.map.set(id, { fn, ms: ms || 0, every: true, at: Date.now() + (ms || 0) }); return id; },
  clearTimeout: function (id) { timers.map.delete(id); },
  clearInterval: function (id) { timers.map.delete(id); },
  requestAnimationFrame: function (fn) { return ctxTimers.setTimeout(() => fn(performance.now()), 16); },
  cancelAnimationFrame: function (id) { ctxTimers.clearTimeout(id); },
};

// ---------- screen ----------
const screen = {
  width: 1080, height: 2340, availWidth: 1080, availHeight: 2274,
  colorDepth: 24, pixelDepth: 24, availLeft: 0, availTop: 0,
  orientation: { type: 'portrait-primary', angle: 0, onchange: null },
};

// ---------- navigator ----------
const navigator = {
  userAgent: UA,
  appVersion: '5.0 (Linux; Android 14; 2106118C Build/UKQ1.231207.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 Mobile Safari/537.36',
  platform: 'Linux armv8l',
  language: 'zh-CN', languages: ['zh-CN', 'zh'],
  appName: 'Netscape', appCodeName: 'Mozilla', product: 'Gecko', productSub: '20030107',
  vendor: 'Google Inc.', vendorSub: '',
  hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 5,
  cookieEnabled: true, onLine: true, doNotTrack: null,
  webdriver: false,
  connection: { effectiveType: '4g', rtt: 100, downlink: 10, saveData: false, type: 'cellular', onchange: null },
  plugins: { length: 5, item: function (i) { return this[i]; }, namedItem: function () { return null; }, refresh: function () {} },
  mimeTypes: { length: 2, item: function (i) { return this[i]; }, namedItem: function () { return null; } },
  getBattery: function () { return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 0.9, addEventListener: function () {}, removeEventListener: function () {} }); },
  getGamepads: function () { return []; },
  sendBeacon: function () { return true; },
  javaEnabled: function () { return false; },
  vibrate: function () { return true; },
};

// ---------- location / history / storage ----------
const location = {
  href: 'https://turing.captcha.qcloud.com/template/drag_ele.html',
  protocol: 'https:', host: 'turing.captcha.qcloud.com', hostname: 'turing.captcha.qcloud.com',
  port: '', pathname: '/template/drag_ele.html', search: '', hash: '',
  origin: 'https://turing.captcha.qcloud.com',
  ancestorOrigins: { length: 0, item: () => null, contains: () => false },
  assign: function () {}, replace: function () {}, reload: function () {}, toString: function () { return this.href; },
};
const history = { length: 3, scrollRestoration: 'auto', state: null, back: function () {}, forward: function () {}, go: function () {}, pushState: function () {}, replaceState: function () {} };
const storageFactory = () => {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; },
    key: i => Object.keys(m)[i] ?? null, get length() { return Object.keys(m).length; },
  };
};

// ---------- performance ----------
const performance = {
  timeOrigin: Date.now() - 3000,
  now: () => Date.now() - 3000 + Math.random() * 2,
  timing: {},
  navigation: { type: 0, redirectCount: 0 },
  getEntries: () => [], getEntriesByType: () => [], getEntriesByName: () => [],
  mark: function () {}, measure: function () {}, clearMarks: function () {}, clearMeasures: function () {},
};

// ---------- canvas(防呆:返回干净随机,不真实绘制) ----------
const canvasCtx = () => ({
  canvas: null,
  fillRect: function () {}, clearRect: function () {}, getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
  putImageData: function () {}, drawImage: function () {},
  fillText: function () {}, strokeText: function () {}, measureText: t => ({ width: String(t).length * 7 }),
  save: function () {}, restore: function () {}, beginPath: function () {}, closePath: function () {},
  moveTo: function () {}, lineTo: function () {}, arc: function () {}, fill: function () {}, stroke: function () {},
  translate: function () {}, rotate: function () {}, scale: function () {}, transform: function () {}, setTransform: function () {},
  createLinearGradient: () => ({ addColorStop: function () {} }), createRadialGradient: () => ({ addColorStop: function () {} }),
  getImageDataHD: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  isPointInPath: () => false,
});
function makeElement(tag) {
  const et = makeEventTarget('elem');
  const el = Object.assign(et, {
    tagName: String(tag).toUpperCase(), nodeName: String(tag).toUpperCase(), nodeType: 1,
    style: new Proxy({}, { get: (t, k) => (k === 'getPropertyValue' ? () => '' : (k in t ? t[k] : '')), set: (t, k, v) => (t[k] = v, true) }),
    children: [], childNodes: [], firstChild: null, lastChild: null, nextSibling: null, previousSibling: null,
    parentNode: null, ownerDocument: null,
    innerHTML: '', outerHTML: '', textContent: '', innerText: '', value: '', id: '', className: '',
    attributes: {}, dataset: {},
    offsetWidth: 0, offsetHeight: 0, offsetLeft: 0, offsetTop: 0, offsetParent: null,
    clientWidth: 0, clientHeight: 0, clientLeft: 0, clientTop: 0,
    scrollWidth: 0, scrollHeight: 0, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    appendChild: function (c) { this.children.push(c); this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { this.children = this.children.filter(x => x !== c); return c; },
    insertBefore: function (n) { this.childNodes.push(n); return n; },
    setAttribute: function (k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; },
    getAttribute: function (k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    hasAttribute: k => k in el.attributes,
    querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: () => [], getElementsByClassName: () => [],
    contains: () => false,
    cloneNode: function () { return makeElement(tag); },
    focus: function () {}, blur: function () {}, click: function () { et.dispatchEvent({ type: 'click' }); },
    getContext: function (type) { const c = canvasCtx(); c.canvas = el; return c; },
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    addEventListener: et.addEventListener, removeEventListener: et.removeEventListener, dispatchEvent: et.dispatchEvent,
  });
  return el;
}

// ---------- document ----------
const document = Object.assign(makeEventTarget('document'), {
  nodeType: 9, doctype: null, documentElement: makeElement('html'), head: makeElement('head'), body: makeElement('body'),
  title: '', cookie: '', domain: 'turing.captcha.qcloud.com', URL: location.href, baseURI: location.href,
  referrer: 'https://h5.if.qidian.com/new/welfareCenter/', readyState: 'complete', visibilityState: 'visible', hidden: false,
  compatMode: 'CSS1Compat', characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html', dir: '', lang: 'zh-CN',
  documentMode: undefined,
  getElementById: function (id) { return this._byId[id] || null; },
  getElementsByClassName: () => [], getElementsByTagName: function (t) { return t === 'head' ? [this.head] : t === 'body' ? [this.body] : []; },
  getElementsByName: () => [], querySelector: function (sel) { return this._byId[sel.replace(/^#/, '')] || null; }, querySelectorAll: () => [],
  createElement: tag => makeElement(tag), createTextNode: t => ({ nodeType: 3, textContent: t, data: t }),
  createDocumentFragment: () => makeElement('fragment'), createEvent: () => ({ initEvent: function (type) { this.type = type; } }),
  createComment: () => ({ nodeType: 8 }), createRange: () => ({ setStart: function () {}, setEnd: function () {}, collapse: function () {}, selectNodeContents: function () {}, createContextualFragment: t => makeElement('div') }),
  hasFocus: () => true, execCommand: () => true, write: function () {}, writeln: function () {}, open: function () {}, close: function () {},
  activeElement: null, defaultView: null, scripts: [], forms: [], images: [], links: [], embeds: [], styleSheets: { length: 0 },
  _byId: {},
});
document.documentElement.parentNode = document;
document.documentElement.ownerDocument = document;
document.body.parentNode = document;
document.head.parentNode = document;
document.activeElement = document.body;
document.defaultView = null; // 稍后指向 window
// 常用固定 id 元素(验证码 DOM)
['tcaptcha_iframe', 'tcaptcha_iframe_dy', 'slideBg', 'slideBlock', 'tcOperation', 'tcaptcha-drag-thumb'].forEach(id => {
  const el = makeElement('div'); el.id = id; document._byId[id] = el;
});

// ---------- window ----------
const sandbox = {};
sandbox.screen = screen;
sandbox.navigator = navigator;
sandbox.location = location;
sandbox.history = history;
sandbox.performance = performance;
sandbox.document = document;
Object.assign(sandbox, ctxTimers);
sandbox.addEventListener = null; // 下面接
sandbox.removeEventListener = null;
sandbox.dispatchEvent = null;
sandbox.postMessage = function () {};
sandbox.name = '';
sandbox.status = '';
sandbox.closed = false;
sandbox.frames = null; // self 引用
sandbox.self = null; sandbox.window = null; sandbox.top = null; sandbox.parent = null; sandbox.globalThis = null;
sandbox.opener = null;
sandbox.length = 0;
sandbox.origin = 'https://turing.captcha.qcloud.com';
sandbox.innerWidth = 1080; sandbox.innerHeight = 2274;
sandbox.outerWidth = 1080; sandbox.outerHeight = 2340;
sandbox.pageXOffset = 0; sandbox.pageYOffset = 0; sandbox.scrollX = 0; sandbox.scrollY = 0;
sandbox.screenX = 0; sandbox.screenY = 0; sandbox.screenLeft = 0; sandbox.screenTop = 0;
sandbox.devicePixelRatio = 3;
sandbox.isSecureContext = true;
sandbox.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: { isInstalled: false } };
sandbox.crypto = { getRandomValues: arr => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }) };
sandbox.TextEncoder = TextEncoder; sandbox.TextDecoder = TextDecoder;
sandbox.URL = URL; sandbox.URLSearchParams = URLSearchParams;
sandbox.Atob = null; sandbox.Btoa = null;
sandbox.btoa = s => Buffer.from(s, 'binary').toString('base64');
sandbox.atob = s => Buffer.from(s, 'base64').toString('binary');
sandbox.localStorage = storageFactory();
sandbox.sessionStorage = storageFactory();
sandbox.indexedDB = { open: () => ({ addEventListener: function () {}, set onsuccess(_) {}, set onerror(_) {}, set onupgradeneeded(_) {} }) };
sandbox.WebSocket = function () { this.send = function () {}; this.close = function () {}; };
sandbox.MutationObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.takeRecords = () => []; };
sandbox.IntersectionObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.unobserve = function () {}; };
sandbox.ResizeObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.unobserve = function () {}; };
sandbox.Event = function (type, opts) { Object.assign(this, opts || {}); this.type = type; this.bubbles = (opts || {}).bubbles || false; this.cancelable = (opts || {}).cancelable || false; };
sandbox.CustomEvent = sandbox.Event;
sandbox.MouseEvent = function (type, opts) { opts = opts || {}; Object.assign(this, opts); this.type = type; this.clientX = opts.clientX || 0; this.clientY = opts.clientY || 0; this.screenX = opts.clientX || 0; this.screenY = (opts.clientY || 0) + 76; this.button = 0; this.buttons = 1; this.view = null; };
sandbox.TouchEvent = sandbox.MouseEvent;
sandbox.KeyboardEvent = sandbox.Event;
sandbox.Image = function () { return makeElement('img'); };
sandbox.HTMLElement = function () {}; sandbox.HTMLCanvasElement = function () {}; sandbox.HTMLImageElement = function () {};
sandbox.XMLHttpRequest = function () {
  this.open = function () {}; this.setRequestHeader = function () {};
  this.send = function () { if (this.onreadystatechange) setTimeout(() => this.onreadystatechange(), 10); if (this.onload) setTimeout(() => this.onload(), 10); };
  this.abort = function () {}; this.getAllResponseHeaders = () => ''; this.getResponseHeader = () => null;
  this.readyState = 4; this.status = 200; this.responseText = ''; this.response = ''; this.withCredentials = false; this.timeout = 0;
};
sandbox.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve(''), headers: { get: () => null } });
sandbox.getComputedStyle = () => new Proxy({}, { get: (t, k) => (k === 'getPropertyValue' ? () => '' : '') });
sandbox.matchMedia = q => ({ matches: false, media: q, onchange: null, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} });
sandbox.alert = function () {}; sandbox.confirm = () => false; sandbox.prompt = () => null;
sandbox.open = () => null; sandbox.close = function () {}; sandbox.focus = function () {}; sandbox.blur = function () {};
sandbox.print = function () {}; sandbox.scrollTo = function () {}; sandbox.scrollBy = function () {}; sandbox.scroll = function () {};
sandbox.stop = function () {}; sandbox.moveTo = function () {}; sandbox.resizeTo = function () {};
sandbox.onmessage = null;
sandbox.console = console;

// window 事件系统 + 自引用
const winEvents = makeEventTarget('window');
sandbox.addEventListener = winEvents.addEventListener.bind(winEvents);
sandbox.removeEventListener = winEvents.removeEventListener.bind(winEvents);
sandbox.dispatchEvent = winEvents.dispatchEvent.bind(winEvents);
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
sandbox.globalThis = sandbox; sandbox.frames = sandbox;
document.defaultView = sandbox;

// window.onxxx 常见钩子
['onload', 'onerror', 'onunload', 'onbeforeunload', 'onmessage', 'onresize', 'onscroll'].forEach(k => { sandbox[k] = null; });


return sandbox;
}
module.exports = { buildSandbox };

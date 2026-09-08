// jsenv.js — 浏览器环境自举(quickjs 全局注入版)
// 与原 env.js(buildSandbox)行为一致,但直接在全局作用域声明:
// 这样 tdc.js 顶层 var 声明与 window.TDC 挂载都落在 globalThis 上,
// 与 node vm.createContext 沙箱语义等价。由 Python 侧 quickjs.Context().eval 执行。

// ---------- polyfill:console 兜底(quickjs 引擎不保证有) ----------
if (typeof console === 'undefined') {
  this.console = { log: function () {}, error: function () {}, warn: function () {}, info: function () {}, debug: function () {}, trace: function () {}, dir: function () {} };
}

// ---------- polyfill:btoa / atob(替代 Node Buffer) ----------
var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var btoa = function (s) {
  s = String(s);
  var out = [];
  for (var i = 0; i < s.length; i += 3) {
    var b0 = s.charCodeAt(i) & 0xff;
    var b1 = i + 1 < s.length ? s.charCodeAt(i + 1) & 0xff : NaN;
    var b2 = i + 2 < s.length ? s.charCodeAt(i + 2) & 0xff : NaN;
    out.push(B64C.charAt(b0 >> 2));
    out.push(B64C.charAt(((b0 & 3) << 4) | (isNaN(b1) ? 0 : (b1 >> 4))));
    out.push(isNaN(b1) ? '=' : B64C.charAt(((b1 & 15) << 2) | (isNaN(b2) ? 0 : (b2 >> 6))));
    out.push(isNaN(b2) ? '=' : B64C.charAt(b2 & 63));
  }
  return out.join('');
};
var atob = function (s) {
  s = String(s).replace(/[^A-Za-z0-9+/]/g, '');
  var out = '';
  for (var i = 0; i < s.length; i += 4) {
    var c0 = B64C.indexOf(s.charAt(i));
    var c1 = B64C.indexOf(s.charAt(i + 1));
    var c2 = s.charAt(i + 2) ? B64C.indexOf(s.charAt(i + 2)) : -1;
    var c3 = s.charAt(i + 3) ? B64C.indexOf(s.charAt(i + 3)) : -1;
    out += String.fromCharCode((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out += String.fromCharCode(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) out += String.fromCharCode(((c2 & 3) << 6) | c3);
  }
  return out;
};

// ---------- polyfill:TextEncoder / TextDecoder(quickjs 无内置) ----------
if (typeof TextEncoder === 'undefined') {
  globalThis.TextEncoder = function () {
    this.encoding = 'utf-8';
    this.encode = function (str) {
      var utf8 = unescape(encodeURIComponent(String(str)));
      var arr = new Uint8Array(utf8.length);
      for (var i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i) & 0xff;
      return arr;
    };
  };
}
if (typeof TextDecoder === 'undefined') {
  globalThis.TextDecoder = function (enc) {
    this.encoding = (enc || 'utf-8').toLowerCase();
    this.decode = function (buf) {
      var arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      var s = '';
      for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
      return decodeURIComponent(escape(s));
    };
  };
}

// ---------- 事件系统 ----------
function makeEventTarget(name) {
  var listeners = {};
  var et = {
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(function (f) { return f !== fn; });
    },
    dispatchEvent: function (ev) {
      ev.target = ev.target || et;
      ev.currentTarget = et;
      ev.srcElement = et;
      (listeners[ev.type] || []).forEach(function (fn) { try { fn.call(et, ev); } catch (e) { console.error('[handler err]', ev.type, e.message); } });
      // onxxx 属性处理器
      var on = 'on' + ev.type;
      if (typeof et[on] === 'function') { try { et[on](ev); } catch (e) {} }
      return true;
    },
    _listeners: listeners,
  };
  return et;
}

// ---------- 定时器(虚拟时间,tdc 会大量 setTimeout;只注册不执行,与 node 版一致) ----------
var timers = { seq: 0, map: {} };
function setTimeout(fn, ms) { var id = ++timers.seq; timers.map[id] = { fn: fn, at: Date.now() + (ms || 0) }; return id; }
function setInterval(fn, ms) { var id = ++timers.seq; timers.map[id] = { fn: fn, ms: ms || 0, every: true, at: Date.now() + (ms || 0) }; return id; }
function clearTimeout(id) { delete timers.map[id]; }
function clearInterval(id) { delete timers.map[id]; }
function requestAnimationFrame(fn) { return setTimeout(function () { fn(performance.now()); }, 16); }
function cancelAnimationFrame(id) { clearTimeout(id); }

// ---------- screen ----------
var screen = {
  width: 1080, height: 2340, availWidth: 1080, availHeight: 2274,
  colorDepth: 24, pixelDepth: 24, availLeft: 0, availTop: 0,
  orientation: { type: 'portrait-primary', angle: 0, onchange: null },
};

// ---------- navigator ----------
var navigator = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; 2106118C Build/UKQ1.231207.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/109.0.5414.86 MQQBrowser/6.2 TBS/047823 Mobile Safari/537.36 QDJSSDK/1.0  QDNightStyle_1  QDReaderAndroid/7.9.420/1656/1002138/Xiaomi/QDShowNativeLoading',
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
var location = {
  href: 'https://turing.captcha.qcloud.com/template/drag_ele.html',
  protocol: 'https:', host: 'turing.captcha.qcloud.com', hostname: 'turing.captcha.qcloud.com',
  port: '', pathname: '/template/drag_ele.html', search: '', hash: '',
  origin: 'https://turing.captcha.qcloud.com',
  ancestorOrigins: { length: 0, item: function () { return null; }, contains: function () { return false; } },
  assign: function () {}, replace: function () {}, reload: function () {}, toString: function () { return this.href; },
};
var history = { length: 3, scrollRestoration: 'auto', state: null, back: function () {}, forward: function () {}, go: function () {}, pushState: function () {}, replaceState: function () {} };
function storageFactory() {
  var m = {};
  return {
    getItem: function (k) { return (k in m ? m[k] : null); },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    clear: function () { for (var k in m) delete m[k]; },
    key: function (i) { return Object.keys(m)[i] !== undefined ? Object.keys(m)[i] : null; },
    get length() { return Object.keys(m).length; },
  };
}

// ---------- performance ----------
var performance = {
  timeOrigin: Date.now() - 3000,
  now: function () { return Date.now() - 3000 + Math.random() * 2; },
  timing: {},
  navigation: { type: 0, redirectCount: 0 },
  getEntries: function () { return []; }, getEntriesByType: function () { return []; }, getEntriesByName: function () { return []; },
  mark: function () {}, measure: function () {}, clearMarks: function () {}, clearMeasures: function () {},
};

// ---------- canvas(防呆:返回干净随机,不真实绘制) ----------
function canvasCtx() {
  return {
    canvas: null,
    fillRect: function () {}, clearRect: function () {},
    getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData: function () {}, drawImage: function () {},
    fillText: function () {}, strokeText: function () {}, measureText: function (t) { return { width: String(t).length * 7 }; },
    save: function () {}, restore: function () {}, beginPath: function () {}, closePath: function () {},
    moveTo: function () {}, lineTo: function () {}, arc: function () {}, fill: function () {}, stroke: function () {},
    translate: function () {}, rotate: function () {}, scale: function () {}, transform: function () {}, setTransform: function () {},
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    getImageDataHD: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    isPointInPath: function () { return false; },
  };
}
function makeElement(tag) {
  var et = makeEventTarget('elem');
  var el = Object.assign(et, {
    tagName: String(tag).toUpperCase(), nodeName: String(tag).toUpperCase(), nodeType: 1,
    style: new Proxy({}, { get: function (t, k) { return (k === 'getPropertyValue' ? function () { return ''; } : (k in t ? t[k] : '')); }, set: function (t, k, v) { t[k] = v; return true; } }),
    children: [], childNodes: [], firstChild: null, lastChild: null, nextSibling: null, previousSibling: null,
    parentNode: null, ownerDocument: null,
    innerHTML: '', outerHTML: '', textContent: '', innerText: '', value: '', id: '', className: '',
    attributes: {}, dataset: {},
    offsetWidth: 0, offsetHeight: 0, offsetLeft: 0, offsetTop: 0, offsetParent: null,
    clientWidth: 0, clientHeight: 0, clientLeft: 0, clientTop: 0,
    scrollWidth: 0, scrollHeight: 0, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: function () { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    appendChild: function (c) { this.children.push(c); this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); return c; },
    insertBefore: function (n) { this.childNodes.push(n); return n; },
    setAttribute: function (k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = v; },
    getAttribute: function (k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute: function (k) { delete this.attributes[k]; },
    hasAttribute: function (k) { return k in el.attributes; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementsByTagName: function () { return []; }, getElementsByClassName: function () { return []; },
    contains: function () { return false; },
    cloneNode: function () { return makeElement(tag); },
    focus: function () {}, blur: function () {}, click: function () { et.dispatchEvent({ type: 'click' }); },
    getContext: function (type) { var c = canvasCtx(); c.canvas = el; return c; },
    toDataURL: function () { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='; },
    addEventListener: et.addEventListener, removeEventListener: et.removeEventListener, dispatchEvent: et.dispatchEvent,
  });
  return el;
}

// ---------- document ----------
var document = Object.assign(makeEventTarget('document'), {
  nodeType: 9, doctype: null, documentElement: makeElement('html'), head: makeElement('head'), body: makeElement('body'),
  title: '', cookie: '', domain: 'turing.captcha.qcloud.com', URL: location.href, baseURI: location.href,
  referrer: 'https://h5.if.qidian.com/new/welfareCenter/', readyState: 'complete', visibilityState: 'visible', hidden: false,
  compatMode: 'CSS1Compat', characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html', dir: '', lang: 'zh-CN',
  documentMode: undefined,
  getElementById: function (id) { return this._byId[id] || null; },
  getElementsByClassName: function () { return []; },
  getElementsByTagName: function (t) { return t === 'head' ? [this.head] : t === 'body' ? [this.body] : []; },
  getElementsByName: function () { return []; },
  querySelector: function (sel) { return this._byId[sel.replace(/^#/, '')] || null; }, querySelectorAll: function () { return []; },
  createElement: function (tag) { return makeElement(tag); },
  createTextNode: function (t) { return { nodeType: 3, textContent: t, data: t }; },
  createDocumentFragment: function () { return makeElement('fragment'); },
  createEvent: function () { return { initEvent: function (type) { this.type = type; } }; },
  createComment: function () { return { nodeType: 8 }; },
  createRange: function () { return { setStart: function () {}, setEnd: function () {}, collapse: function () {}, selectNodeContents: function () {}, createContextualFragment: function (t) { return makeElement('div'); } }; },
  hasFocus: function () { return true; }, execCommand: function () { return true; },
  write: function () {}, writeln: function () {}, open: function () {}, close: function () {},
  activeElement: null, defaultView: null, scripts: [], forms: [], images: [], links: [], embeds: [], styleSheets: { length: 0 },
  _byId: {},
});
document.documentElement.parentNode = document;
document.documentElement.ownerDocument = document;
document.body.parentNode = document;
document.head.parentNode = document;
document.activeElement = document.body;
// 常用固定 id 元素(验证码 DOM)
['tcaptcha_iframe', 'tcaptcha_iframe_dy', 'slideBg', 'slideBlock', 'tcOperation', 'tcaptcha-drag-thumb'].forEach(function (id) {
  var el = makeElement('div'); el.id = id; document._byId[id] = el;
});

// ---------- window:即当前 quickjs 全局对象 ----------
var window = globalThis;
var self = window, top = window, parent = window, frames = window;

// window 事件系统
var winEvents = makeEventTarget('window');
var addEventListener = winEvents.addEventListener.bind(winEvents);
var removeEventListener = winEvents.removeEventListener.bind(winEvents);
var dispatchEvent = winEvents.dispatchEvent.bind(winEvents);

var postMessage = function () {};
var name = '';
var status = '';
var closed = false;
var opener = null;
var length = 0;
var origin = 'https://turing.captcha.qcloud.com';
var innerWidth = 1080; var innerHeight = 2274;
var outerWidth = 1080; var outerHeight = 2340;
var pageXOffset = 0; var pageYOffset = 0; var scrollX = 0; var scrollY = 0;
var screenX = 0; var screenY = 0; var screenLeft = 0; var screenTop = 0;
var devicePixelRatio = 3;
var isSecureContext = true;
var chrome = { runtime: {}, loadTimes: function () {}, csi: function () {}, app: { isInstalled: false } };
var crypto = {
  getRandomValues: function (arr) { for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; },
  randomUUID: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); },
};
var Atob = null; var Btoa = null;
var localStorage = storageFactory();
var sessionStorage = storageFactory();
var indexedDB = { open: function () { return { addEventListener: function () {}, set onsuccess(_) {}, set onerror(_) {}, set onupgradeneeded(_) {} }; } };
var WebSocket = function () { this.send = function () {}; this.close = function () {}; };
var MutationObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.takeRecords = function () { return []; }; };
var IntersectionObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.unobserve = function () {}; };
var ResizeObserver = function (cb) { this.observe = function () {}; this.disconnect = function () {}; this.unobserve = function () {}; };
var Event = function (type, opts) { Object.assign(this, opts || {}); this.type = type; this.bubbles = (opts || {}).bubbles || false; this.cancelable = (opts || {}).cancelable || false; };
var CustomEvent = Event;
var MouseEvent = function (type, opts) { opts = opts || {}; Object.assign(this, opts); this.type = type; this.clientX = opts.clientX || 0; this.clientY = opts.clientY || 0; this.screenX = opts.clientX || 0; this.screenY = (opts.clientY || 0) + 76; this.button = 0; this.buttons = 1; this.view = null; };
var TouchEvent = MouseEvent;
var KeyboardEvent = Event;
var Image = function () { return makeElement('img'); };
var HTMLElement = function () {}; var HTMLCanvasElement = function () {}; var HTMLImageElement = function () {};
var XMLHttpRequest = function () {
  this.open = function () {}; this.setRequestHeader = function () {};
  this.send = function () { if (this.onreadystatechange) setTimeout(function () { this.onreadystatechange(); }, 10); if (this.onload) setTimeout(function () { this.onload(); }, 10); };
  this.abort = function () {}; this.getAllResponseHeaders = function () { return ''; }; this.getResponseHeader = function () { return null; };
  this.readyState = 4; this.status = 200; this.responseText = ''; this.response = ''; this.withCredentials = false; this.timeout = 0;
};
var fetch = function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); }, headers: { get: function () { return null; } } }); };
var getComputedStyle = function () { return new Proxy({}, { get: function (t, k) { return (k === 'getPropertyValue' ? function () { return ''; } : ''); } }); };
var matchMedia = function (q) { return { matches: false, media: q, onchange: null, addListener: function () {}, removeEventListener: function () {}, addEventListener: function () {} }; };
var alert = function () {}; var confirm = function () { return false; }; var prompt = function () { return null; };
var open = function () { return null; }; var close = function () {}; var focus = function () {}; var blur = function () {};
var print = function () {}; var scrollTo = function () {}; var scrollBy = function () {}; var scroll = function () {};
var stop = function () {}; var moveTo = function () {}; var resizeTo = function () {};
var onmessage = null;

document.defaultView = window;

// window.onxxx 常见钩子
['onload', 'onerror', 'onunload', 'onbeforeunload', 'onresize', 'onscroll'].forEach(function (k) { window[k] = null; });

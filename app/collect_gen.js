// 生成 collect:执行 tdc.js + 注入拟人触摸轨迹
// 用法: node collect_gen.js <tdc_js_path> <target_x> <target_y> [out_json]
// 输出: JSON {collect, tlg, eks, tokenid}
const fs = require('fs');
const vm = require('vm');
const { buildSandbox } = require('./env.js');

const tdcPath = process.argv[2];
const startX = 50; // 滑块初始 x(init_pos[0], track_limit 下限)
const targetX = parseInt(process.argv[3] || '300', 10);
const targetY = parseInt(process.argv[4] || '250', 10);
const outFile = process.argv[5] || null;

const sandbox = buildSandbox();
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(tdcPath, 'utf8'), sandbox, { filename: 'tdc.js', timeout: 15000 });

if (!sandbox.TDC) { console.error('TDC 未挂载'); process.exit(1); }

// ---------- 拟人触摸轨迹 ----------
// 位移:缓动(先快后慢) + 微抖动;时间:总时长 600~1100ms,步进 10~30ms
function rand(a, b) { return a + Math.random() * (b - a); }

function genTrack(from, to, baseY) {
  const dist = to - from;
  const dur = rand(650, 1050);            // 总时长 ms
  const steps = Math.floor(rand(28, 45)); // move 次数
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // easeOutCubic 为主,叠加轻微 sin 摆动
    const ease = 1 - Math.pow(1 - t, 3);
    let x = from + dist * ease + Math.sin(t * Math.PI * rand(2, 3.5)) * rand(0.5, 2.2) * (1 - t);
    // y:围绕目标 y 轻微漂移(手指不会严格直线)
    const y = baseY + Math.sin(t * Math.PI) * rand(-3, 3) + rand(-1, 1);
    pts.push({ x: Math.round(x), y: Math.round(y), t: Math.round(dur * (t * 0.85 + 0.15 * t * t)) });
  }
  // 时间戳单调递增
  for (let i = 1; i < pts.length; i++) if (pts[i].t <= pts[i - 1].t) pts[i].t = pts[i - 1].t + 1;
  return pts;
}

function mkTouch(type, x, y, ts) {
  const base = { clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y + 76, identifier: 0, target: sandbox.document.body, radiusX: 1.5, radiusY: 1.5, rotationAngle: 0, force: rand(0.8, 1) };
  return {
    type, bubbles: true, cancelable: true, composed: true,
    touches: type === 'touchend' ? [] : [base],
    targetTouches: type === 'touchend' ? [] : [base],
    changedTouches: [base],
    clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y + 76,
    button: 0, buttons: type === 'touchend' ? 0 : 1, detail: 1, view: sandbox,
    srcElement: sandbox.document.body, target: sandbox.document.body, currentTarget: sandbox.document.body,
    timeStamp: ts,
    preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {},
  };
}

// ---------- 派发轨迹 ----------
const t0 = Date.now();
const track = genTrack(startX, targetX, targetY);
// 按下(略高于轨道 y)
sandbox.document.dispatchEvent(mkTouch('touchstart', startX, track[0].y, 12));
// move 序列
for (const p of track) {
  sandbox.document.dispatchEvent(mkTouch('touchmove', p.x, p.y, p.t));
  sandbox.document.body.dispatchEvent(mkTouch('touchmove', p.x, p.y, p.t + 1));
}
// 抬起
const last = track[track.length - 1];
sandbox.document.dispatchEvent(mkTouch('touchend', last.x, last.y, last.t + rand(40, 120)));

// ---------- 组装 verify 数据(复刻 dy-ele getTdcData/verify 逻辑) ----------
// getTdcData: setData({ft: ...}) 然后 getData(!0)
sandbox.TDC.setData({ ft: String(Date.now()) });
const collectEnc = sandbox.TDC.getData(true);
const collect = decodeURIComponent(collectEnc);          // verify 用 decode 后的值
const info = sandbox.TDC.getInfo();
const eks = info.info || '';
const tokenid = info.tokenid || '';

const result = {
  collect, tlg: collect.length, eks, tokenid,
  ans: JSON.stringify([{ elem_id: 1, type: 'DynAnswerType_POS', data: `${targetX},${last.y}` }]),
  elapsed_ms: Date.now() - t0,
};
const out = JSON.stringify(result);
if (outFile) fs.writeFileSync(outFile, out); else console.log(out);
console.error(`[collect_gen] 轨迹 ${track.length} 步, collect ${result.tlg} 字符, eks ${eks.length}, 耗时 ${result.elapsed_ms}ms`);

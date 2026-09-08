// collect_gen.js — 在已就绪的浏览器环境(jsenv.js 先行执行)中运行 tdc.js 并注入拟人触摸轨迹
// Python 侧调用: runTdc(tdcSource, targetX, targetY) → JSON 字符串
// 返回: {collect, tlg, eks, tokenid, ans, elapsed_ms} 或 {error: '...'}

function runTdc(tdcSource, targetX, targetY) {
  var t0 = Date.now();
  targetX = parseInt(targetX, 10) || 300;
  targetY = parseInt(targetY, 10) || 250;
  var startX = 50; // 滑块初始 x(init_pos[0], track_limit 下限)

  // 顶层全局执行 tdc.js(间接 eval:var 声明挂在 globalThis,与 node vm 沙箱一致)
  (0, eval)(tdcSource);

  if (typeof TDC === 'undefined') {
    return JSON.stringify({ error: 'TDC 未挂载' });
  }

  // ---------- 拟人触摸轨迹 ----------
  // 位移:缓动(先快后慢) + 微抖动;时间:总时长 600~1100ms,步进 10~30ms
  function rand(a, b) { return a + Math.random() * (b - a); }

  function genTrack(from, to, baseY) {
    var dist = to - from;
    var dur = rand(650, 1050);            // 总时长 ms
    var steps = Math.floor(rand(28, 45)); // move 次数
    var pts = [];
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      // easeOutCubic 为主,叠加轻微 sin 摆动
      var ease = 1 - Math.pow(1 - t, 3);
      var x = from + dist * ease + Math.sin(t * Math.PI * rand(2, 3.5)) * rand(0.5, 2.2) * (1 - t);
      // y:围绕目标 y 轻微漂移(手指不会严格直线)
      var y = baseY + Math.sin(t * Math.PI) * rand(-3, 3) + rand(-1, 1);
      pts.push({ x: Math.round(x), y: Math.round(y), t: Math.round(dur * (t * 0.85 + 0.15 * t * t)) });
    }
    // 时间戳单调递增
    for (var j = 1; j < pts.length; j++) if (pts[j].t <= pts[j - 1].t) pts[j].t = pts[j - 1].t + 1;
    return pts;
  }

  function mkTouch(type, x, y, ts) {
    var base = { clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y + 76, identifier: 0, target: document.body, radiusX: 1.5, radiusY: 1.5, rotationAngle: 0, force: rand(0.8, 1) };
    return {
      type: type, bubbles: true, cancelable: true, composed: true,
      touches: type === 'touchend' ? [] : [base],
      targetTouches: type === 'touchend' ? [] : [base],
      changedTouches: [base],
      clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y + 76,
      button: 0, buttons: type === 'touchend' ? 0 : 1, detail: 1, view: window,
      srcElement: document.body, target: document.body, currentTarget: document.body,
      timeStamp: ts,
      preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {},
    };
  }

  // ---------- 派发轨迹 ----------
  var track = genTrack(startX, targetX, targetY);
  // 按下(略高于轨道 y)
  document.dispatchEvent(mkTouch('touchstart', startX, track[0].y, 12));
  // move 序列
  for (var i = 0; i < track.length; i++) {
    var p = track[i];
    document.dispatchEvent(mkTouch('touchmove', p.x, p.y, p.t));
    document.body.dispatchEvent(mkTouch('touchmove', p.x, p.y, p.t + 1));
  }
  // 抬起
  var last = track[track.length - 1];
  document.dispatchEvent(mkTouch('touchend', last.x, last.y, last.t + rand(40, 120)));

  // ---------- 组装 verify 数据(复刻 dy-ele getTdcData/verify 逻辑) ----------
  // getTdcData: setData({ft: ...}) 然后 getData(!0)
  TDC.setData({ ft: String(Date.now()) });
  var collectEnc = TDC.getData(true);
  var collect = decodeURIComponent(collectEnc);          // verify 用 decode 后的值
  var info = TDC.getInfo();
  var eks = info.info || '';
  var tokenid = info.tokenid || '';

  var result = {
    collect: collect, tlg: collect.length, eks: eks, tokenid: tokenid,
    ans: JSON.stringify([{ elem_id: 1, type: 'DynAnswerType_POS', data: targetX + ',' + last.y }]),
    elapsed_ms: Date.now() - t0,
  };
  return JSON.stringify(result);
}

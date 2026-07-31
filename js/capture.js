/* ============================================================
   capture.js — SVG 선화 내보내기 (수능 지면 규격)
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─

   화면 렌더와 **같은 SVG path 빌더**(js/svg-shapes.js)를 써서 <path d="…">
   를 그대로 찍어내므로, 보이는 그림과 내보낸 벡터가 동일한 기하를 공유한다.
   출력은 흰 바탕 · 검정 선 · 회색 채움 — 학습지에 그대로 붙일 수 있는 형태.
   ============================================================ */

  /* ================================================================
     [SVG EXPORT]
  ================================================================ */

  const _SVG_NS = 'http://www.w3.org/2000/svg';

  function _esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** SVG 조각 누적기 — 월드 좌표를 그대로 쓰고 viewBox 로 잘라낸다 */
  function _svgDoc() {
    const parts = [];
    const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const grow = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < bb.x0) bb.x0 = x; if (x > bb.x1) bb.x1 = x;
      if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y;
    };
    /** path d 문자열의 좌표를 훑어 bbox 확장 */
    const growPath = (d) => {
      const nums = d.match(/-?\d+(\.\d+)?/g);
      if (!nums) return;
      for (let i = 0; i + 1 < nums.length; i += 2) grow(+nums[i], +nums[i + 1]);
    };
    return {
      parts, bb, grow,
      path(d, attrs) {
        if (!d) return;
        growPath(d);
        parts.push(`<path d="${d}" ${attrs}/>`);
      },
      text(t, x, y, size, opt) {
        grow(x, y);
        const o = opt || {};
        parts.push(
          `<text x="${_n2(x)}" y="${_n2(y)}" font-family="${_esc(o.ko ? SN.fontKo : SN.font)}"`
          + ` font-size="${_n2(size)}"${o.italic ? ' font-style="italic"' : ''}`
          + ` text-anchor="${o.align || 'middle'}" dominant-baseline="${o.baseline || 'middle'}"`
          + ` fill="${o.color || '#000'}">${_esc(t)}</text>`);
      },
    };
  }
  const _n2 = (v) => Math.round(v * 100) / 100;

  /** 선 굵기: 화면 px 고정값을 월드 단위로 환산 (내보낼 때는 scale=1 기준) */
  function _lw(px) { return _n2(px / VIEWPORT.scale); }

  /**
   * 현재 씬을 SVG 문자열로 직렬화.
   * 화면 렌더와 동일한 svg-shapes 빌더를 사용한다.
   */
  function buildSceneSVG() {
    const cs = CONFIG.cellSize;
    const doc = _svgDoc();
    const INK = '#000000';

    /* ── 바닥면: 실체면 회색 띠 → 마찰 띠 → 본선 ── */
    for (const seg of STATE.floorSegments) {
      const ax = seg.x1 * cs, ay = seg.y1 * cs;
      const bx = seg.x2 * cs, by = seg.y2 * cs;

      const chord    = Math.hypot(bx - ax, by - ay);
      const roughLen = chord * (seg.pathType.startsWith('ARC') ? 2.5 : 2);
      const pts = seg._samplePath(ax, ay, bx, by, Math.max(3 / VIEWPORT.scale, roughLen / 900));

      if (pts.length >= 2) {
        // 실체면 띠 (인쇄용은 그라데이션 대신 균일 연회색 — 지면에서 같은 인상)
        doc.path(svgBand(pts, 11 / VIEWPORT.scale, +1), 'fill="#000000" fill-opacity="0.10" stroke="none"');
        if (seg.isFriction) {
          doc.path(svgBand(pts, 4.5 / VIEWPORT.scale, +1), 'fill="#000000" fill-opacity="0.30" stroke="none"');
          const m = pts[Math.floor(pts.length / 2)];
          if (m) {
            doc.text('마찰',
              m.x + (-m.ty) * (20 / VIEWPORT.scale),
              m.y + ( m.tx) * (20 / VIEWPORT.scale),
              _n2(SN_FS.surface / VIEWPORT.scale), { ko: true, color: 'rgba(0,0,0,0.78)' });
          }
        }
        // 본선: 샘플 점을 그대로 이어 SVG path 로 (곡면도 동일 기하)
        doc.path(svgPolyline([{ x: ax, y: ay }].concat(pts.map(p => ({ x: p.x, y: p.y }))).concat([{ x: bx, y: by }])),
                 `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwTerrain)}" stroke-linejoin="round" stroke-linecap="round"`);
      }
    }

    /* ── 궤적 (표시 중인 물체만) — 물체·실 아래에 깔린다 ── */
    for (const el of STATE.elements) {
      if (!el.showTrail || !el._trail || el._trail.length < 2) continue;
      const d = svgPolyline(el._trail.map(p => ({ x: p.x * cs, y: p.y * cs })));
      doc.path(d, `fill="none" stroke="#000000" stroke-opacity="0.42"`
        + ` stroke-width="${_lw(1.2)}" stroke-dasharray="${_lw(5)},${_lw(4)}"`
        + ` stroke-linejoin="round" stroke-linecap="round"`);
    }

    /* ── 실 ── */
    for (const rope of STATE.ropes) {
      const A = rope._getAnchorWorld(rope.anchorA);
      const B = rope._getAnchorWorld(rope.anchorB);
      if (!A || !B) continue;
      doc.path(`M ${_n2(A.x)} ${_n2(A.y)} L ${_n2(B.x)} ${_n2(B.y)}`,
               `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`);
    }

    /* ── 요소 ── */
    for (const el of STATE.elements) {
      const bx = el.gridX * cs, by = el.gridY * cs;
      const bw = el.gridW * cs, bh = el.gridH * cs;
      const cx = bx + bw / 2,   cy = by + bh / 2;
      const geomAttr = `fill="${SN.bodyFill}" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`;

      if (el.type === 'rect') {
        doc.path(svgRect(bx, by, bw, bh), geomAttr);
        const fs = Math.max(bh * 0.20, Math.min(18, bh * 0.34));
        if (snLabelFits(el.mass + ' kg', fs, bw)) doc.text(el.mass + ' kg', cx, cy, _n2(fs), { italic: true });
        else doc.text(el.mass + ' kg', cx, _n2(by - fs * 0.5), _n2(fs), { italic: true, baseline: 'auto' });

      } else if (el.type === 'circle') {
        const cr = bw / 2;
        doc.path(svgCircle(cx, cy, cr), geomAttr);
        const fsc = Math.max(cr * 0.36, Math.min(18, cr * 0.66));
        if (snLabelFits(el.mass + ' kg', fsc, 2 * cr * 0.85)) doc.text(el.mass + ' kg', cx, cy, _n2(fsc), { italic: true });
        else doc.text(el.mass + ' kg', cx, _n2(cy - cr - fsc * 0.5), _n2(fsc), { italic: true, baseline: 'auto' });

      } else if (el.type === 'pulley') {
        const r = Math.min(bw, bh) * 0.45;
        const w = svgPulleyWheel(cx, cy, r);
        const yk = svgPulleyYoke(cx, cy, r, -Math.PI / 2, r * 1.5);
        doc.path(yk.arms, `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`);
        doc.path(yk.pin,  `fill="#ffffff" stroke="${INK}" stroke-width="${_lw(SN.lwThin)}"`);
        doc.path(w.rim,   `fill="#ffffff" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`);
        doc.path(w.inner, `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwThin)}"`);
        doc.path(w.hub,   `fill="${SN.bodyFill}" stroke="${INK}" stroke-width="${_lw(SN.lwThin)}"`);
        doc.path(w.axle,  `fill="${INK}" stroke="none"`);

      } else if (el.type === 'spring') {
        const ep = el.getEndpointsWorld();
        const A = ep ? { x: ep.ax, y: ep.ay } : { x: bx, y: cy };
        const B = ep ? { x: ep.bx, y: ep.by } : { x: bx + bw, y: cy };
        const amp   = Math.max(Math.min(el.gridW, el.gridH) * cs * 0.38, 3.5);
        doc.path(svgCoil(A.x, A.y, B.x, B.y, amp, svgCoilCountForK(el.k)),
                 `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}" stroke-linejoin="round"`);

      } else if (el.type === 'forceZone') {
        const box = svgRect(bx, by, bw, bh);
        doc.path(box, `fill="#000000" fill-opacity="0.07" stroke="rgba(0,0,0,0.55)" stroke-width="${_lw(SN.lwThin)}" stroke-dasharray="${_lw(4)},${_lw(3)}"`);
        const mag = Math.hypot(el.fx, el.fy);
        if (mag > 0) {
          const aLen = Math.min(bw, bh) * 0.4;
          const ux = el.fx / mag, uy = -el.fy / mag;
          const a = svgArrow(cx - ux * aLen * 0.35, cy - uy * aLen * 0.35,
                             cx + ux * aLen * 0.75, cy + uy * aLen * 0.75,
                             8 / VIEWPORT.scale, 3.4 / VIEWPORT.scale);
          doc.path(a.shaft, `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`);
          doc.path(a.head,  `fill="${INK}" stroke="none"`);
        }
        doc.text(`F = ${+mag.toFixed(3)} N`, cx, by + _n2(10 / VIEWPORT.scale), _n2(SN_FS.force / VIEWPORT.scale), { italic: true });

      } else if (el.type === 'extforce') {
        let ux = 0, uy = -1;
        const att = el._getAttached();
        if (att && att.body) {
          const w = getAttachPointWorld(att.body, att.bodyAnchor.attachPoint);
          const dx = cx - w.x, dy = cy - w.y, L = Math.hypot(dx, dy);
          if (L > 1e-6) { ux = dx / L; uy = dy / L; }
        }
        const aLen = cs * 1.4;
        const a = svgArrow(cx, cy, cx + ux * aLen, cy + uy * aLen,
                           10 / VIEWPORT.scale, 4 / VIEWPORT.scale);
        doc.path(a.shaft, `fill="none" stroke="${INK}" stroke-width="${_lw(SN.lwGeom)}"`);
        doc.path(a.head,  `fill="${INK}" stroke="none"`);
        doc.path(svgCircle(cx, cy, 2.2 / VIEWPORT.scale), `fill="${INK}" stroke="none"`);
        const px = -uy, py = ux;
        doc.text(`${el.forceN} N`,
          cx + ux * aLen * 0.55 + px * (10 / VIEWPORT.scale),
          cy + uy * aLen * 0.55 + py * (10 / VIEWPORT.scale),
          _n2(SN_FS.force / VIEWPORT.scale), { italic: true });
      }
    }

    /* ── viewBox: 내용 bbox + 여백 ── */
    const bb = doc.bb;
    if (!isFinite(bb.x0)) { bb.x0 = 0; bb.y0 = 0; bb.x1 = 100; bb.y1 = 100; }
    const pad = Math.max((bb.x1 - bb.x0), (bb.y1 - bb.y0)) * 0.06 + 6;
    const vx = _n2(bb.x0 - pad), vy = _n2(bb.y0 - pad);
    const vw = _n2((bb.x1 - bb.x0) + pad * 2), vh = _n2((bb.y1 - bb.y0) + pad * 2);

    return `<?xml version="1.0" encoding="UTF-8"?>\n`
      + `<svg xmlns="${_SVG_NS}" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">\n`
      + `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>\n`
      + doc.parts.join('\n') + `\n</svg>\n`;
  }

  /** 촬영 버튼: SVG 파일로 저장 */
  function captureImage() {
    const svg  = buildSceneSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mechanics_sim.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  }

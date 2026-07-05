/* ============================================================
   capture.js — PNG 선화 캡처
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */
  /* ================================================================
     [CAPTURE] — PNG 저장
  ================================================================ */

  /* ================================================================
     [CAPTURE] — PNG 선화 저장
  ================================================================ */

  function captureImage() {
    const tmp = document.createElement('canvas');
    tmp.width  = mainCanvas.width;
    tmp.height = mainCanvas.height;
    const tc   = tmp.getContext('2d');
    const s    = VIEWPORT.scale;

    // 배경: 투명 (clearRect만)
    tc.clearRect(0, 0, tmp.width, tmp.height);
    applyViewport(tc);

    const lw = 2 / s;

    // ── FloorSegment 선화 ──
    for (const seg of STATE.floorSegments) {
      const cs = CONFIG.cellSize;
      const ax = seg.x1 * cs, ay = seg.y1 * cs;
      const bx = seg.x2 * cs, by = seg.y2 * cs;
      tc.save();
      tc.strokeStyle = '#000000';
      tc.lineWidth   = lw;
      tc.fillStyle   = 'transparent';
      tc.beginPath();
      seg._tracePath(tc, ax, ay, bx, by);
      tc.stroke();
      tc.restore();
    }

    // ── Rope 선화 ──
    for (const rope of STATE.ropes) {
      const wA = rope._getAnchorWorld(rope.anchorA);
      const wB = rope._getAnchorWorld(rope.anchorB);
      if (!wA || !wB) continue;
      tc.save();
      tc.strokeStyle = '#000000';
      tc.lineWidth   = lw;
      tc.beginPath();
      tc.moveTo(wA.x, wA.y);
      tc.lineTo(wB.x, wB.y);
      tc.stroke();
      tc.restore();
    }

    // ── Element 선화 ──
    for (const el of STATE.elements) {
      const cs = CONFIG.cellSize;
      tc.save();
      tc.strokeStyle = '#000000';
      tc.lineWidth   = lw;
      tc.fillStyle   = 'transparent';

      switch (el.type) {
        case 'rect': {
          const bx = el.gridX * cs, by = el.gridY * cs;
          const bw = el.gridW * cs, bh = el.gridH * cs;
          tc.beginPath();
          tc.rect(bx, by, bw, bh);
          tc.stroke();
          // 질량 텍스트
          tc.fillStyle = '#000000';
          tc.font = `${Math.max(8, Math.min(14, bh * 0.35)) / s}px 'Courier New', monospace`;
          tc.textAlign = 'center';
          tc.textBaseline = 'middle';
          tc.fillText(el.mass + 'kg', bx + bw/2, by + bh/2);
          break;
        }
        case 'circle': {
          const bx = el.gridX * cs, by = el.gridY * cs;
          const bw = el.gridW * cs, bh = el.gridH * cs;
          const cx = bx + bw/2, cy = by + bh/2, r = bw/2;
          tc.beginPath();
          tc.arc(cx, cy, r, 0, Math.PI * 2);
          tc.stroke();
          tc.fillStyle = '#000000';
          tc.font = `${Math.max(8, Math.min(14, r * 0.7)) / s}px 'Courier New', monospace`;
          tc.textAlign = 'center';
          tc.textBaseline = 'middle';
          tc.fillText(el.mass + 'kg', cx, cy);
          break;
        }
        case 'forceZone': {
          const bx = el.gridX * cs, by = el.gridY * cs;
          const bw = el.gridW * cs, bh = el.gridH * cs;
          tc.strokeStyle = '#555555';
          tc.setLineDash([4/s, 3/s]);
          tc.beginPath();
          tc.rect(bx, by, bw, bh);
          tc.stroke();
          tc.setLineDash([]);
          // 힘 화살표
          const mag = Math.hypot(el.fx, el.fy);
          if (mag > 0) {
            const arrowLen = Math.min(bw, bh) * 0.35;
            const ux = el.fx/mag, uy = -el.fy/mag;
            const cx = bx+bw/2, cy = by+bh/2;
            drawArrow(tc,
              cx - ux*arrowLen*0.3, cy - uy*arrowLen*0.3,
              cx + ux*arrowLen*0.7, cy + uy*arrowLen*0.7,
              '#333333');
          }
          break;
        }
        case 'pulley': {
          const bx = el.gridX * cs, by = el.gridY * cs;
          const bw = el.gridW * cs, bh = el.gridH * cs;
          const cx = bx + bw/2, cy = by + bh/2;
          const r  = Math.min(bw, bh) * 0.45;
          tc.beginPath();
          tc.arc(cx, cy, r, 0, Math.PI * 2);
          tc.stroke();
          tc.beginPath();
          tc.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          tc.stroke();
          break;
        }
        case 'spring': {
          const b2  = el._getRenderBounds();
          const bx  = b2.x, by = b2.y, bw = b2.w, bh = b2.h;
          const coils = 6;
          if (!el.isVertical) {
            const margin = Math.min(bw * 0.1, cs * 0.3);
            const x0 = bx + margin, x1 = bx + bw - margin;
            const cy = by + bh / 2;
            const amp  = Math.max(bh * 0.30, 2 / s);
            const step = Math.max(x1 - x0, 1) / (coils * 2);
            tc.beginPath();
            tc.moveTo(bx, cy); tc.lineTo(x0, cy);
            for (let i = 0; i < coils * 2; i++)
              tc.lineTo(x0 + step*(i+0.5), cy + (i%2===0 ? -amp : amp));
            tc.lineTo(x1, cy); tc.lineTo(bx + bw, cy);
            tc.stroke();
          } else {
            const margin = Math.min(bh * 0.1, cs * 0.3);
            const y0 = by + margin, y1 = by + bh - margin;
            const cx = bx + bw / 2;
            const amp  = Math.max(bw * 0.30, 2 / s);
            const step = Math.max(y1 - y0, 1) / (coils * 2);
            tc.beginPath();
            tc.moveTo(cx, by); tc.lineTo(cx, y0);
            for (let i = 0; i < coils * 2; i++)
              tc.lineTo(cx + (i%2===0 ? -amp : amp), y0 + step*(i+0.5));
            tc.lineTo(cx, y1); tc.lineTo(cx, by + bh);
            tc.stroke();
          }
          break;
        }
      }
      tc.restore();
    }

    tc.setTransform(1, 0, 0, 1, 0, 0);

    tmp.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'mechanics_sim.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

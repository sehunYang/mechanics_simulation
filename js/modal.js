/* ============================================================
   modal.js — 공용 모달: 숫자 키패드 + 확인 다이얼로그
   ─ 클래식 스크립트: 전역 스코프 공유, index.html 순서대로 로드 ─
   ============================================================ */

  let _modalOverlay = null;

  function _closeModal() {
    if (_modalOverlay) {
      _modalOverlay.remove();
      _modalOverlay = null;
    }
  }

  function _openOverlay() {
    _closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // 오버레이 자체(바깥 영역) 클릭 = 취소
    overlay.addEventListener('click', () => _closeModal());
    document.body.appendChild(overlay);
    _modalOverlay = overlay;
    return overlay;
  }

  function _modalButton(label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'modal-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  /* ================================================================
     [숫자 키패드 모달]
     openNumericKeypad({ initialValue, onConfirm, onCancel, min, max, step })
  ================================================================ */
  function openNumericKeypad({ initialValue, onConfirm, onCancel, min, max, step } = {}) {
    const overlay = _openOverlay();

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-keypad';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    let buf = (initialValue !== undefined && initialValue !== null && !isNaN(initialValue))
      ? String(initialValue) : '0';

    const display = document.createElement('div');
    display.className = 'modal-keypad-display';
    display.textContent = buf;
    dialog.appendChild(display);

    if (min !== undefined || max !== undefined) {
      const hint = document.createElement('div');
      hint.className = 'modal-keypad-hint';
      const minTxt = min !== undefined ? min : '';
      const maxTxt = max !== undefined ? max : '';
      hint.textContent = `범위: ${minTxt} ~ ${maxTxt}`;
      dialog.appendChild(hint);
    }

    const updateDisplay = () => { display.textContent = buf; };

    const pressDigit = (d) => {
      if (buf === '0') buf = d;
      else buf += d;
      updateDisplay();
    };
    const pressDot = () => {
      if (!buf.includes('.')) buf += '.';
      updateDisplay();
    };
    const toggleSign = () => {
      buf = buf.startsWith('-') ? buf.slice(1) : '-' + buf;
      updateDisplay();
    };
    const pressBackspace = () => {
      buf = buf.slice(0, -1);
      if (buf === '' || buf === '-') buf = '0';
      updateDisplay();
    };
    const pressClear = () => {
      buf = '0';
      updateDisplay();
    };

    const grid = document.createElement('div');
    grid.className = 'modal-keypad-grid';
    const gridKeys = ['7','8','9','4','5','6','1','2','3','.','0','±'];
    gridKeys.forEach(k => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'modal-keypad-key';
      key.textContent = k;
      key.addEventListener('click', () => {
        if (k === '.') pressDot();
        else if (k === '±') toggleSign();
        else pressDigit(k);
      });
      grid.appendChild(key);
    });
    dialog.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'modal-keypad-actions';
    const clearKey = document.createElement('button');
    clearKey.type = 'button';
    clearKey.className = 'modal-keypad-key';
    clearKey.textContent = 'C';
    clearKey.addEventListener('click', pressClear);
    const backKey = document.createElement('button');
    backKey.type = 'button';
    backKey.className = 'modal-keypad-key';
    backKey.textContent = '⌫';
    backKey.addEventListener('click', pressBackspace);
    actions.appendChild(clearKey);
    actions.appendChild(backKey);
    dialog.appendChild(actions);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.appendChild(_modalButton('취소', '', () => {
      _closeModal();
      if (onCancel) onCancel();
    }));
    footer.appendChild(_modalButton('확인', 'modal-btn-accent', () => {
      const v = parseFloat(buf);
      _closeModal();
      if (!isNaN(v) && onConfirm) onConfirm(v);
    }));
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
  }

  /* ================================================================
     [확인 다이얼로그]
     openConfirmDialog({ message, onConfirm, onCancel, confirmLabel, cancelLabel, danger })
  ================================================================ */
  function openConfirmDialog({ message, onConfirm, onCancel, confirmLabel, cancelLabel, danger } = {}) {
    const overlay = _openOverlay();

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-confirm';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const msg = document.createElement('div');
    msg.className = 'modal-message';
    msg.textContent = message || '';
    dialog.appendChild(msg);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.appendChild(_modalButton(cancelLabel || '취소', '', () => {
      _closeModal();
      if (onCancel) onCancel();
    }));
    footer.appendChild(_modalButton(confirmLabel || '확인', danger ? 'modal-btn-danger' : 'modal-btn-accent', () => {
      _closeModal();
      if (onConfirm) onConfirm();
    }));
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
  }

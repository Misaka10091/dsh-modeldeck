/**
 * dsh-modeldeck — Client half (Web).
 *
 * Layout (approved): icon-only ghost trigger in `conversation.input.activity`;
 * a `position: fixed` panel floats ABOVE the whole composer card (never covers
 * the input or toolbar). No `onActiveChange` (that would hide the toolbar).
 *
 * Data (this step): real model catalog + apply through the built-in shared
 * model-selection service `ctx.modelDirectories.directoryFor(sessionId)`:
 *   - directory.store.getSnapshot() -> { current, groups, ... }
 *   - directory.select({provider, model, reasoningEffort}) -> { ok, error }
 * The fixed presets and recent history are persisted per project key in
 * localStorage. NOTE: localStorage is a client-side prototype store; the PRD
 * target is project-scoped durable Host storage — see README / task notes.
 */

const STYLESHEET = `
.mdk-root { display: inline-flex; align-items: center; }
.mdk-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; border: none;
  border-radius: var(--dsw-radius-sm, 8px); background: 0 0;
  color: var(--dsw-alias-label-secondary, inherit); cursor: pointer;
}
.mdk-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }
.mdk-trigger:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6)); }
.mdk-trigger:disabled { opacity: .5; cursor: not-allowed; }
.mdk-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }
.mdk-icon { width: 16px; height: 16px; }

.mdk-panel {
  position: fixed; z-index: 2147483000; width: 440px; max-width: calc(100vw - 24px);
  box-sizing: border-box; padding: 14px 16px 12px; border-radius: 14px;
  background: var(--dsw-alias-bg-base, #fff);
  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28));
  box-shadow: 0 10px 32px rgba(0,0,0,.16);
  color: var(--dsw-alias-label-primary, inherit); font-size: 13px;
}
.mdk-head { display: flex; align-items: center; gap: 8px; }
.mdk-title { font-weight: 600; font-size: 14px; white-space: nowrap; }
.mdk-current {
  display: inline-flex; align-items: center; height: 22px; padding: 0 8px; min-width: 0;
  border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-secondary, inherit); font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px;
}
.mdk-spacer { flex: 1; }
.mdk-ibtn {
  width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--dsw-radius-sm, 8px); background: 0 0;
  color: var(--dsw-alias-label-secondary, inherit); cursor: pointer; flex: 0 0 auto;
  font-size: 16px; line-height: 1;
}
.mdk-ibtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }
.mdk-hr { height: 1px; background: var(--dsw-alias-border-l1, rgba(127,127,127,.2)); margin: 10px -4px; }
.mdk-section { display: flex; align-items: flex-start; gap: 10px; margin-top: 10px; }
.mdk-glabel {
  flex: 0 0 34px; padding-top: 6px; font-size: 11px; letter-spacing: .02em;
  color: var(--dsw-alias-label-tertiary, inherit); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 4px;
}
/* 固定区：强化 —— 主色强调条 + 加粗深色标签 */
.mdk-section--pinned .mdk-glabel {
  color: var(--dsw-alias-label-primary, inherit); font-weight: 600; font-size: 12px;
}
.mdk-section--pinned .mdk-glabel::before {
  content: ''; flex: 0 0 auto; width: 3px; height: 12px; border-radius: 2px;
  background: var(--dsw-alias-state-business-primary, #3b82f6);
}
/* 最近区：弱化 —— 虚线分隔 + 淡化标签，读作次级区域 */
.mdk-section--recent {
  margin-top: 12px; padding-top: 11px;
  border-top: 1px dashed var(--dsw-alias-border-l1, rgba(127,127,127,.16));
}
.mdk-section--recent .mdk-glabel { opacity: .55; font-weight: 500; }
.mdk-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; flex: 1; }
.mdk-chip {
  height: 26px; padding: 0 10px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.28));
  background: 0 0; color: var(--dsw-alias-label-primary, inherit);
  font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer;
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; vertical-align: middle;
  transition: background .12s ease, border-color .12s ease, color .12s ease, opacity .12s ease;
}
.mdk-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.mdk-chip[data-active="true"] { border-color: var(--dsw-alias-state-business-primary, #3b82f6); color: var(--dsw-alias-state-business-primary, #3b82f6); }
/* 固定项：实心浅底 + 中粗字，视觉更重 */
.mdk-chip--pinned {
  height: 28px; padding: 0 12px; font-weight: 500;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10));
  border-color: transparent;
}
.mdk-chip--pinned:hover {
  background: rgba(127,127,127,.18);
  border-color: var(--dsw-alias-border-l1, rgba(127,127,127,.30));
}
.mdk-chip--pinned[data-active="true"] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3b82f6) 14%, transparent);
  border-color: var(--dsw-alias-state-business-primary, #3b82f6);
  color: var(--dsw-alias-state-business-primary, #3b82f6);
}
/* 历史项：不高亮、尽量淡化存在感（无描边无底色），悬停才轻微提起 */
.mdk-chip--recent {
  height: 22px; padding: 0 7px; font-weight: 400;
  color: var(--dsw-alias-label-tertiary, inherit);
  border-color: transparent; background: 0 0;
  opacity: .55;
}
.mdk-chip--recent:hover {
  opacity: 1; color: var(--dsw-alias-label-secondary, inherit);
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10));
}
/* 即使命中当前组合也不高亮：保持和历史项一致的低存在感 */
.mdk-chip--recent[data-active="true"] {
  color: var(--dsw-alias-label-tertiary, inherit);
  border-color: transparent; background: 0 0; opacity: .55;
}
.mdk-item { display: inline-flex; align-items: center; gap: 1px; }
.mdk-item[draggable="true"] { cursor: grab; }
.mdk-item[draggable="true"]:active { cursor: grabbing; }
.mdk-pinbtn {
  width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 6px; background: 0 0;
  color: var(--dsw-alias-label-tertiary, inherit); cursor: pointer; flex: 0 0 auto; padding: 0;
}
.mdk-pinbtn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, inherit); }
.mdk-pinbtn[data-pinned="true"] { color: var(--dsw-alias-state-business-primary, #3b82f6); }
/* Action icons stay hidden until the item is hovered or focused. */
.mdk-item .mdk-pinbtn { opacity: 0; transition: opacity .12s ease; }
.mdk-item:hover .mdk-pinbtn, .mdk-item:focus-within .mdk-pinbtn { opacity: 1; }
.mdk-pin { width: 13px; height: 13px; }
.mdk-input {
  height: 26px; padding: 0 8px; border-radius: 8px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-state-business-primary, #3b82f6);
  background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, inherit);
  font: inherit; font-size: 12px; min-width: 150px; max-width: 240px; outline: none;
}
.mdk-empty { padding-top: 5px; font-size: 12px; color: var(--dsw-alias-label-tertiary, inherit); }
.mdk-note { margin-top: 10px; font-size: 11px; line-height: 1.4; color: var(--dsw-alias-label-tertiary, inherit); }
.mdk-err { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-state-error-primary, #e5484d); }

.mdk-list { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.mdk-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; padding: 8px 10px; border: none; border-radius: 8px; background: 0 0;
  color: var(--dsw-alias-label-primary, inherit); font: inherit; font-size: 13px;
  text-align: left; cursor: pointer;
}
.mdk-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.mdk-row-sub { font-size: 12px; color: var(--dsw-alias-label-tertiary, inherit); }
.mdk-crumb { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; color: var(--dsw-alias-label-tertiary, inherit); }
.mdk-link { border: none; background: 0 0; color: var(--dsw-alias-state-business-primary, #3b82f6); cursor: pointer; font: inherit; padding: 0; }
`;

window.__ModuleLoader__.load({
  id: '@misaka10091/dsh-modeldeck',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const LS_PREFIX = 'dsh-modeldeck:deck:';
    const HISTORY_LIMIT = 20;
    const SEP = '\u0000';

    const keyOf = (s) => `${s.provider || ''}${SEP}${s.model || ''}${SEP}${s.reasoningEffort || ''}`;
    const fmt = (s) => {
      if (!s || !s.provider || !s.model) return '自定义';
      const base = `${s.provider} / ${s.model}`;
      return s.reasoningEffort ? `${base} · ${s.reasoningEffort}` : base;
    };
    const presetName = (s) => {
      const base = `${s.provider} / ${s.model}`;
      return s.reasoningEffort ? `${base} (${s.reasoningEffort})` : base;
    };
    function buildLookup(groups) {
      const p = {}, m = {}, e = {};
      for (const g of groups || []) {
        p[g.id] = g.name || g.id;
        for (const mm of g.models || []) {
          m[g.id + SEP + mm.id] = mm.name || mm.id;
          for (const ef of (mm.reasoning && mm.reasoning.efforts) || []) {
            e[g.id + SEP + mm.id + SEP + ef.id] = ef.name || ef.id;
          }
        }
      }
      return { p, m, e };
    }
    function labelWith(s, lookup) {
      if (!s || !s.provider || !s.model) return '自定义';
      // Match the host model selector: use the model's display name (which
      // already carries its provider suffix) plus the reasoning effort, e.g.
      // "DeepSeek-V4.1-Flash · WorkBuddy High" — not "provider / model".
      const mn = (lookup && lookup.m[s.provider + SEP + s.model]) || s.model;
      if (!s.reasoningEffort) return mn;
      const raw = (lookup && lookup.e[s.provider + SEP + s.model + SEP + s.reasoningEffort]) || s.reasoningEffort;
      const en = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
      return mn + ' ' + en;
    }

    function loadDeck(key) {
      try {
        const raw = window.localStorage.getItem(LS_PREFIX + key);
        const d = raw ? JSON.parse(raw) : null;
        if (d && Array.isArray(d.presets) && Array.isArray(d.history)) return d;
      } catch (e) { /* ignore */ }
      return { presets: [], history: [] };
    }
    function saveDeck(key, deck) {
      try { window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(deck)); } catch (e) { /* ignore */ }
    }
    function recordSuccess(deck, sel, now) {
      const key = keyOf(sel);
      if (deck.presets.some((p) => keyOf(p) === key)) return deck; // already fixed: no history
      const history = deck.history.filter((e) => keyOf(e) !== key);
      const entry = { provider: sel.provider, model: sel.model, lastUsedAt: now };
      if (sel.reasoningEffort) entry.reasoningEffort = sel.reasoningEffort;
      history.unshift(entry);
      history.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      return { presets: deck.presets, history: history.slice(0, HISTORY_LIMIT) };
    }
    function addPreset(deck, sel, name) {
      const key = keyOf(sel);
      if (deck.presets.some((p) => keyOf(p) === key)) return { deck, duplicate: true };
      const preset = { id: 'p' + Date.now().toString(36), name: name || presetName(sel), provider: sel.provider, model: sel.model };
      if (sel.reasoningEffort) preset.reasoningEffort = sel.reasoningEffort;
      const history = deck.history.filter((e) => keyOf(e) !== key);
      return { deck: { presets: deck.presets.concat(preset), history }, duplicate: false };
    }
    function removePreset(deck, id) {
      return { presets: deck.presets.filter((p) => p.id !== id), history: deck.history };
    }
    function touchPreset(deck, sel, now) {
      const key = keyOf(sel);
      return {
        presets: deck.presets.map((p) => (keyOf(p) === key ? Object.assign({}, p, { lastUsedAt: now }) : p)),
        history: deck.history,
      };
    }
    function pinFromHistory(deck, entry, name) {
      const key = keyOf(entry);
      const preset = { id: 'p' + Date.now().toString(36), name: name || presetName(entry), provider: entry.provider, model: entry.model, lastUsedAt: entry.lastUsedAt };
      if (entry.reasoningEffort) preset.reasoningEffort = entry.reasoningEffort;
      return { presets: deck.presets.concat(preset), history: deck.history.filter((e) => keyOf(e) !== key) };
    }
    function unpinPreset(deck, preset) {
      const key = keyOf(preset);
      const entry = { provider: preset.provider, model: preset.model, lastUsedAt: preset.lastUsedAt || Date.now() };
      if (preset.reasoningEffort) entry.reasoningEffort = preset.reasoningEffort;
      const history = deck.history.filter((e) => keyOf(e) !== key);
      history.push(entry);
      history.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      return { presets: deck.presets.filter((p) => p.id !== preset.id), history: history.slice(0, HISTORY_LIMIT) };
    }

    function getSessionId(props) {
      const s = (props && (props.session || (props.binding && props.binding.session) || props.target)) || {};
      return s.sessionId || s.id || (props && (props.sessionId || props.sessionID)) || null;
    }
    function getProjectKey(props) {
      const s = (props && (props.session || (props.binding && props.binding.session) || props.target)) || {};
      return s.workspacePath || s.projectId || s.cwd || (s.workspace && s.workspace.path) || (props && props.workspacePath) || 'global';
    }

    function IconDeck() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'mdk-icon', 'aria-hidden': true },
        h('rect', { x: 4, y: 5, width: 16, height: 12, rx: 2 }),
        h('path', { d: 'M8 21h8' }));
    }
    function IconX() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: 'M6 6l12 12M18 6L6 18' }));
    }
    function IconPin({ filled }) {
      return h('svg', {
        viewBox: '0 0 24 24', className: 'mdk-pin',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M12 17v5' }),
        h('path', { d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z' }));
    }
    function IconEdit() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', width: 13, height: 13, 'aria-hidden': true },
        h('path', { d: 'M12 20h9' }),
        h('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z' }));
    }

    const PANEL_WIDTH = 440;

    function ModelDeckActivity(props, ref) {
      void ref;
      const { locked, ctx } = props || {};
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const [deck, setDeck] = React.useState({ presets: [], history: [] });
      const [snap, setSnap] = React.useState(null);
      const [view, setView] = React.useState('list'); // 'list' | 'add'
      const [addGroup, setAddGroup] = React.useState(null);
      const [status, setStatus] = React.useState('');
      const [err, setErr] = React.useState('');
      const [editingId, setEditingId] = React.useState(null);
      const [draftName, setDraftName] = React.useState('');
      const triggerRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const dirRef = React.useRef(null);
      const dragIdRef = React.useRef(null);

      const sessionId = getSessionId(props);
      const projectKey = getProjectKey(props);

      const deckRef = React.useRef({ presets: [], history: [] });
      const projectKeyRef = React.useRef(projectKey);
      const lastCurrentKeyRef = React.useRef(undefined);
      projectKeyRef.current = projectKey;

      // Load persisted deck for the project key.
      React.useEffect(() => {
        const d = loadDeck(projectKey);
        deckRef.current = d;
        lastCurrentKeyRef.current = undefined;
        setDeck(d);
      }, [projectKey]);

      const updateDeck = (next) => { deckRef.current = next; setDeck(next); saveDeck(projectKeyRef.current, next); };

      // Resolve the shared model directory and subscribe to catalog/current.
      // The store is shared with the host model selector, so a `current` change
      // also covers switches made through the native dropdown: record those as
      // recent history (excluding combinations that already live in presets).
      React.useEffect(() => {
        if (!ctx || !sessionId) return undefined;
        const md = ctx.modelDirectories;
        if (!md || typeof md.directoryFor !== 'function') return undefined;
        let dir;
        try { dir = md.directoryFor(sessionId); } catch (e) { return undefined; }
        dirRef.current = dir;
        const store = dir && dir.store;
        if (!store) return undefined;
        const sync = () => {
          let s;
          try { s = store.getSnapshot(); } catch (e) { return; }
          setSnap(s);
          const cur = s && s.current;
          const k = cur ? keyOf(cur) : null;
          const prev = lastCurrentKeyRef.current;
          if (prev !== undefined && k && k !== prev) {
            const inPreset = deckRef.current.presets.some((p) => keyOf(p) === k);
            if (!inPreset) {
              const next = recordSuccess(
                deckRef.current,
                { provider: cur.provider, model: cur.model, ...(cur.reasoningEffort ? { reasoningEffort: cur.reasoningEffort } : {}) },
                Date.now(),
              );
              deckRef.current = next;
              setDeck(next);
              saveDeck(projectKeyRef.current, next);
            }
          }
          lastCurrentKeyRef.current = k;
        };
        sync();
        let unsub;
        try { unsub = store.subscribe(sync); } catch (e) { /* ignore */ }
        if (typeof dir.load === 'function') { try { Promise.resolve(dir.load()).catch(() => {}); } catch (e) { /* ignore */ } }
        return () => { if (typeof unsub === 'function') unsub(); };
      }, [ctx, sessionId]);

      const computePos = () => {
        const el = triggerRef.current;
        if (!el) return;
        const tb = el.getBoundingClientRect();
        let node = el.parentElement, composerTop = tb.top;
        for (let i = 0; i < 10 && node; i += 1) {
          const r = node.getBoundingClientRect();
          if (r.width >= 300 && r.height >= 80 && Math.abs(r.bottom - tb.bottom) <= 48 && r.top < tb.top - 16) composerTop = r.top;
          node = node.parentElement;
        }
        const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
        const left = Math.max(12, Math.min((window.innerWidth - width) / 2, window.innerWidth - width - 12));
        setPos({ left, bottom: window.innerHeight - composerTop + 10, width, maxHeight: Math.max(180, composerTop - 18) });
      };

      const close = () => { setOpen(false); setView('list'); setAddGroup(null); setStatus(''); setErr(''); };

      React.useEffect(() => {
        if (!open) return undefined;
        computePos();
        const onReflow = () => computePos();
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        return () => { window.removeEventListener('resize', onReflow); window.removeEventListener('scroll', onReflow, true); };
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
          const t = e.target;
          if (panelRef.current && panelRef.current.contains(t)) return;
          if (triggerRef.current && triggerRef.current.contains(t)) return;
          close();
        };
        const onKey = (e) => { if (e && e.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
      }, [open]);

      const current = (snap && snap.current) || null;
      const groups = (snap && snap.groups) || [];
      const currentKey = current ? keyOf(current) : null;
      const lookup = buildLookup(groups);
      const labelOf = (s) => labelWith(s, lookup);

      const apply = async (sel) => {
        setErr(''); setStatus('');
        const dir = dirRef.current;
        if (!dir || typeof dir.select !== 'function') { setErr('模型目录不可用'); return; }
        try {
          const res = await dir.select({ provider: sel.provider, model: sel.model, ...(sel.reasoningEffort ? { reasoningEffort: sel.reasoningEffort } : {}) });
          if (res && res.ok === false) { setErr((res.error && res.error.code ? res.error.code + ': ' : '') + (res.error && res.error.message ? res.error.message : '应用失败')); return; }
          const tuple = { provider: sel.provider, model: sel.model, ...(sel.reasoningEffort ? { reasoningEffort: sel.reasoningEffort } : {}) };
          const now = Date.now();
          let next = recordSuccess(deckRef.current, tuple, now);
          next = touchPreset(next, tuple, now);
          updateDeck(next);
          setStatus('已应用');
        } catch (e) {
          setErr('应用失败：' + (e && e.message ? e.message : String(e)));
        }
      };

      const handleAdd = (sel) => {
        setErr('');
        const name = labelOf({ provider: sel.provider, model: sel.model, ...(sel.reasoningEffort ? { reasoningEffort: sel.reasoningEffort } : {}) });
        const r = addPreset(deck, { provider: sel.provider, model: sel.model, ...(sel.reasoningEffort ? { reasoningEffort: sel.reasoningEffort } : {}) }, name);
        if (r.duplicate) { setErr('该配置已在固定区'); return; }
        updateDeck(r.deck);
        setView('list'); setAddGroup(null); setStatus('已添加固定配置');
      };

      const pinEntry = (e) => { setErr(''); updateDeck(pinFromHistory(deckRef.current, e, labelOf(e))); setStatus('已钉住'); };
      const unpinOne = (p) => { setErr(''); updateDeck(unpinPreset(deckRef.current, p)); setStatus('已取消钉住'); };
      const removeOne = (p) => { setErr(''); updateDeck({ presets: deckRef.current.presets.filter((x) => x.id !== p.id), history: deckRef.current.history }); setStatus('已移除'); };
      const removeHistory = (e) => { const key = keyOf(e); setErr(''); updateDeck({ presets: deckRef.current.presets, history: deckRef.current.history.filter((x) => keyOf(x) !== key) }); setStatus('已从历史移除'); };
      const startRename = (p) => { setEditingId(p.id); setDraftName(p.renamed ? p.name : labelOf(p)); };
      const commitRename = () => {
        const id = editingId; if (!id) return;
        const name = (draftName || '').trim();
        setEditingId(null); setDraftName('');
        if (!name) return;
        updateDeck({ presets: deckRef.current.presets.map((p) => (p.id === id ? Object.assign({}, p, { name, renamed: true }) : p)), history: deckRef.current.history });
        setStatus('已重命名');
      };
      const cancelRename = () => { setEditingId(null); setDraftName(''); };
      const reorder = (fromId, toId) => {
        const arr = deckRef.current.presets.slice();
        const fi = arr.findIndex((p) => p.id === fromId);
        const ti = arr.findIndex((p) => p.id === toId);
        if (fi < 0 || ti < 0 || fi === ti) return;
        const moved = arr.splice(fi, 1)[0];
        arr.splice(ti, 0, moved);
        updateDeck({ presets: arr, history: deckRef.current.history });
        setStatus('顺序已更新');
      };

      const trigger = h('button', {
        ref: triggerRef, type: 'button', className: 'mdk-trigger', disabled: !!locked,
        'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false', 'aria-label': '模型卡组',
        title: '模型卡组：快速切换模型与推理等级',
        onClick: () => !locked && (open ? close() : setOpen(true)),
      }, h(IconDeck));

      let body;
      if (view === 'add') {
        const flow = [];
        if (!addGroup) {
          flow.push(h('div', { key: 'crumb', className: 'mdk-crumb' }, h('button', { className: 'mdk-link', onClick: () => setView('list') }, '← 返回'), h('span', null, '选择提供商')));
          flow.push(h('div', { key: 'list', className: 'mdk-list' },
            groups.length ? groups.map((g) => h('button', { key: g.id, className: 'mdk-row', onClick: () => setAddGroup(g) },
              h('span', null, g.name || g.id), h('span', { className: 'mdk-row-sub' }, String((g.models || []).length) + ' 个模型')))
              : h('div', { className: 'mdk-empty' }, '目录加载中或为空')));
        } else {
          flow.push(h('div', { key: 'crumb', className: 'mdk-crumb' },
            h('button', { className: 'mdk-link', onClick: () => setAddGroup(null) }, '← 返回'),
            h('span', null, (addGroup.name || addGroup.id) + ' · 选择模型')));
          const rows = [];
          for (const m of addGroup.models || []) {
            const efforts = (m.reasoning && m.reasoning.efforts) || [];
            if (!efforts.length) {
              rows.push(h('button', { key: m.id, className: 'mdk-row', onClick: () => handleAdd({ provider: addGroup.id, model: m.id }) },
                h('span', null, m.name || m.id), h('span', { className: 'mdk-row-sub' }, '无推理等级')));
            } else {
              rows.push(h('div', { key: m.id, style: { padding: '6px 10px' } },
                h('div', { className: 'mdk-row-sub', style: { marginBottom: '4px' } }, m.name || m.id),
                h('div', { className: 'mdk-chips' },
                  efforts.map((ef) => h('button', { key: ef.id, className: 'mdk-chip', onClick: () => handleAdd({ provider: addGroup.id, model: m.id, reasoningEffort: ef.id }) }, ef.name || ef.id)))));
            }
          }
          flow.push(h('div', { key: 'list', className: 'mdk-list' }, rows.length ? rows : h('div', { className: 'mdk-empty' }, '该提供商暂无可用模型')));
        }
        body = h(React.Fragment, null, flow);
      } else {
        body = h(React.Fragment, null,
          h('div', { className: 'mdk-section mdk-section--pinned' },
            h('span', { className: 'mdk-glabel' }, '固定'),
            deck.presets.length
              ? h('div', { className: 'mdk-chips' }, deck.presets.map((p) =>
                  h('span', {
                    key: p.id, className: 'mdk-item', draggable: editingId !== p.id, title: '拖动可排序',
                    onDragStart: (ev) => { dragIdRef.current = p.id; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', p.id); } catch (e) { /* ignore */ } },
                    onDragOver: (ev) => { ev.preventDefault(); },
                    onDrop: (ev) => { ev.preventDefault(); const from = dragIdRef.current || (ev.dataTransfer && ev.dataTransfer.getData('text/plain')); dragIdRef.current = null; if (from) reorder(from, p.id); },
                  },
                    editingId === p.id
                      ? h('input', {
                          className: 'mdk-input', value: draftName, autoFocus: true,
                          onChange: (ev) => setDraftName(ev.target.value),
                          onKeyDown: (ev) => { if (ev.key === 'Enter') commitRename(); else if (ev.key === 'Escape') cancelRename(); },
                          onBlur: commitRename,
                        })
                      : h('button', { className: 'mdk-chip mdk-chip--pinned', 'data-active': currentKey === keyOf(p) ? 'true' : 'false', title: (p.renamed ? p.name : labelOf(p)) + '\n双击改名', onClick: () => apply(p), onDoubleClick: () => startRename(p) }, p.renamed ? p.name : labelOf(p)),
                    h('button', { className: 'mdk-pinbtn', 'data-pinned': 'true', 'aria-label': '取消钉住', 'aria-pressed': 'true', title: '取消钉住', onClick: () => unpinOne(p) }, h(IconPin, { filled: true })),
                    h('button', { className: 'mdk-pinbtn', 'aria-label': '重命名', title: '重命名', onClick: () => startRename(p) }, h(IconEdit)),
                    h('button', { className: 'mdk-pinbtn', 'aria-label': '移除', title: '从固定区移除', onClick: () => removeOne(p) }, h(IconX)))))
              : h('span', { className: 'mdk-empty' }, '暂无固定配置'),
            h('button', { className: 'mdk-ibtn', title: '添加固定配置', 'aria-label': '添加固定配置', onClick: () => { setErr(''); setView('add'); setAddGroup(null); } }, '＋')),
          h('div', { className: 'mdk-section mdk-section--recent' },
            h('span', { className: 'mdk-glabel' }, '最近'),
            deck.history.length
              ? h('div', { className: 'mdk-chips' }, deck.history.map((e, i) =>
                  h('span', { key: 'h' + i, className: 'mdk-item' },
                    h('button', { className: 'mdk-chip mdk-chip--recent', 'data-active': currentKey === keyOf(e) ? 'true' : 'false', title: labelOf(e), onClick: () => apply(e) }, labelOf(e)),
                    h('button', { className: 'mdk-pinbtn', 'data-pinned': 'false', 'aria-label': '钉住', 'aria-pressed': 'false', title: '钉住到固定区', onClick: () => pinEntry(e) }, h(IconPin, { filled: false })),
                    h('button', { className: 'mdk-pinbtn', 'aria-label': '移除', title: '从历史移除', onClick: () => removeHistory(e) }, h(IconX)))))
              : h('span', { className: 'mdk-empty' }, '暂无历史')));
      }

      const panel = open ? h('div', {
        ref: panelRef, className: 'mdk-panel', role: 'dialog', 'aria-label': '模型卡组',
        style: pos ? { left: pos.left, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight, overflowY: 'auto' } : { left: 12, bottom: 120 },
      },
        h('div', { className: 'mdk-head' },
          h('span', { className: 'mdk-title' }, '模型卡组'),
          view === 'list' ? h('span', { className: 'mdk-current', title: labelOf(current) }, labelOf(current)) : null,
          h('span', { className: 'mdk-spacer' }),
          h('button', { type: 'button', className: 'mdk-ibtn', 'aria-label': '关闭', title: '关闭', onClick: close }, h(IconX))),
        h('div', { className: 'mdk-hr' }),
        body,
        status ? h('div', { className: 'mdk-note' }, status) : null,
        err ? h('div', { className: 'mdk-err' }, err) : null,
        view === 'list' ? h('div', { className: 'mdk-note' }, '应用会同时更新共享默认值，其他项目中新建或未选择的会话之后可能继承它。') : null,
      ) : null;

      return h(React.Fragment, null, h('div', { className: 'mdk-root' }, trigger), panel);
    }

    // Wrap to inject the plugin ctx without the slot framework needing to pass it.
    let pluginCtx = null;
    function ActivitySeat(props) {
      return h(ModelDeckActivity, Object.assign({}, props, { ctx: pluginCtx }));
    }

    return {
      inject: ['slots', 'modelDirectories'],
      apply(ctx) {
        pluginCtx = ctx;
        ctx.effect(() => {
          const el = document.createElement('style');
          el.setAttribute('data-dsh-modeldeck', '');
          el.textContent = STYLESHEET;
          document.head.appendChild(el);
          return () => el.remove();
        });
        ctx.slots.inject('conversation.input.activity', () =>
          ctx.slots.register({ name: 'conversation.input.activity', id: 'dsh-modeldeck', order: 10 }, ActivitySeat));
      },
    };
  },
});

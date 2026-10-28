/**
 * dsh-modeldeck — Client half (Web).
 *
 * Follows the official bundle Client template exactly: a lazy factory registered
 * through `window.__ModuleLoader__.load({ id, factory(require) { ... } })` whose
 * `apply` contributes one entry to the `conversation.composer.dock` slot.
 *
 * The factory is side-effect free: it only declares values and returns the
 * plugin object. All registration happens inside `apply`. React comes from the
 * browser module table via `require('react')`; no Harness Client package is
 * imported and only `--dsw-alias-*` theme tokens are referenced for styling.
 *
 * Integration status: this renders the compact current-configuration summary
 * and an expandable panel for fixed presets + recent history, but the live data
 * bindings and the apply action are documented TODO placeholders — the slot
 * props contract and the Remote selection call must be confirmed live
 * (implement.md A1) rather than invented here.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-modeldeck',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Token names below MUST be confirmed against `cordis_inspect_query` Theme
    // before shipping (implement.md A1). Fallbacks only keep the panel
    // renderable when a token is absent; no literal colors are used.
    const styles = {
      root: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
      button: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border, currentColor)',
        background: 'var(--dsw-alias-bg-elevated, transparent)',
        color: 'var(--dsw-alias-text, inherit)',
        font: 'inherit',
        lineHeight: 1.2,
        cursor: 'pointer',
      },
      buttonTitle: { fontWeight: 600 },
      summary: {
        color: 'var(--dsw-alias-text-secondary, inherit)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '220px',
      },
      panel: {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        minWidth: '260px',
        maxWidth: '340px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border, currentColor)',
        background: 'var(--dsw-alias-bg-elevated, transparent)',
        color: 'var(--dsw-alias-text, inherit)',
        boxShadow: 'var(--dsw-alias-shadow-popover, none)',
        zIndex: 20,
      },
      sectionTitle: {
        margin: '8px 0 4px',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--dsw-alias-text-secondary, inherit)',
      },
      row: {
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: '8px',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      },
      rowName: { fontWeight: 500 },
      rowMeta: {
        color: 'var(--dsw-alias-text-secondary, inherit)',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      },
      empty: {
        padding: '6px 8px',
        color: 'var(--dsw-alias-text-secondary, inherit)',
        fontSize: '12px',
      },
      disclosure: {
        margin: '10px 0 0',
        fontSize: '11px',
        lineHeight: 1.35,
        color: 'var(--dsw-alias-text-secondary, inherit)',
      },
      message: {
        marginTop: '8px',
        fontSize: '12px',
        color: 'var(--dsw-alias-text-secondary, inherit)',
      },
    };

    /**
     * Format a selection for display. `null` means "no known selection", which
     * the UI must present as Custom (R5 / AC-08).
     * TODO: read the real current selection from the slot props projection
     * (`binding.session.projections.faceOf('modelSelection')`); the exact slot
     * props shape is unverified (implement.md A1).
     */
    function formatSelection(selection) {
      if (!selection || !selection.provider || !selection.model) {
        return 'Custom';
      }
      const base = `${selection.provider} / ${selection.model}`;
      return selection.reasoningEffort
        ? `${base} (${selection.reasoningEffort})`
        : base;
    }

    /** Read the current selection from whatever props the slot provides. */
    function readCurrentSelection(props) {
      if (!props) return null;
      const candidate = props.currentSelection || props.selection;
      if (candidate && candidate.provider && candidate.model) return candidate;
      return null;
    }

    function renderRow(item, key, onApply) {
      const label = item.name || formatSelection(item);
      return h(
        'button',
        {
          key,
          type: 'button',
          style: styles.row,
          title: label,
          onClick: () => onApply(item),
        },
        h('span', { style: styles.rowName }, label),
        h(
          'span',
          { style: styles.rowMeta },
          item.reasoningEffort ? item.reasoningEffort : '',
        ),
      );
    }

    function ModelDeckButton(props) {
      const [open, setOpen] = React.useState(false);
      const [status, setStatus] = React.useState('');

      const current = readCurrentSelection(props);
      // TODO: hydrate these from the persisted project deck delivered by the
      // Host. Left empty so the panel renders honest empty states rather than
      // fabricated entries.
      const presets = [];
      const history = [];

      const handleApply = (item) => {
        // TODO(dsh-modeldeck): apply through the SUPPORTED interface once
        // wired. Do NOT invent APIs. Intended call:
        //   const r = await ctx.remote.session.selectModel({
        //     sessionId, provider: item.provider, model: item.model,
        //     reasoningEffort: item.reasoningEffort,
        //   });
        // On success record history; on { ok: false } surface
        // error.code/message and leave the deck unchanged. The shared-default
        // side effect is disclosed in the panel below.
        setStatus('Applying a preset is not wired in this build yet.');
      };

      return h(
        'div',
        { style: styles.root },
        h(
          'button',
          {
            type: 'button',
            style: styles.button,
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            title: 'Model Deck',
            onClick: () => setOpen((value) => !value),
          },
          h('span', { style: styles.buttonTitle }, 'Model Deck'),
          h('span', { style: styles.summary }, formatSelection(current)),
        ),
        open
          ? h(
              'div',
              { style: styles.panel, role: 'dialog', 'aria-label': 'Model Deck' },
              h('div', { style: styles.sectionTitle }, 'Current configuration'),
              h('div', { style: styles.empty }, formatSelection(current)),
              h('div', { style: styles.sectionTitle }, 'Fixed presets'),
              presets.length
                ? presets.map((item, index) =>
                    renderRow(item, `preset-${item.id || index}`, handleApply),
                  )
                : h('div', { style: styles.empty }, 'No fixed presets yet.'),
              h('div', { style: styles.sectionTitle }, 'Recent history'),
              history.length
                ? history.map((item, index) =>
                    renderRow(item, `history-${index}`, handleApply),
                  )
                : h('div', { style: styles.empty }, 'No recent history yet.'),
              // R5 disclosure: applying also updates the shared default.
              h(
                'p',
                { style: styles.disclosure },
                'Applying a selection also updates the shared model default. ' +
                  'New or unused sessions in other projects may inherit it.',
              ),
              status
                ? h('div', { style: styles.message, role: 'status' }, status)
                : null,
            )
          : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'dsh-modeldeck',
              order: 5,
            },
            ModelDeckButton,
          ),
        );
      },
    };
  },
});

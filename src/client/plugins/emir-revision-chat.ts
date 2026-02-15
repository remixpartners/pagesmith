// src/client/plugins/emir-revision-chat.ts
import type { Editor } from 'grapesjs';
import * as api from '../api.js';
import type { EmirMessage } from '../api.js';

interface EmirContext {
  emirApi: string;
  syncToken: string;
  proposalId: string;
}

function getEmirContext(): EmirContext | null {
  const params = new URLSearchParams(window.location.search);
  const emirApi = params.get('emir_api') || sessionStorage.getItem('emir-api-url');
  const file = params.get('file');

  if (!emirApi || !file) return null;

  const match = file.match(/proposal-(\d+)\.html/);
  if (!match) return null;

  // Resolve token from query params OR sessionStorage (for page reloads/navigation)
  const syncToken = params.get('sync_token') || sessionStorage.getItem(`emir-sync-token-${match[1]}`);
  if (!syncToken) return null;

  return { emirApi, syncToken, proposalId: match[1] };
}

function showToast(message: string, isError = false) {
  const existing = document.querySelector('.pagesmith-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'pagesmith-toast' + (isError ? ' pagesmith-toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function emirRevisionChatPlugin(editor: Editor) {
  const ctx = getEmirContext();
  if (!ctx) return; // Not an EMIR proposal — plugin does nothing

  let panelEl: HTMLElement | null = null;
  let messagesEl: HTMLElement | null = null;
  let inputEl: HTMLTextAreaElement | null = null;
  let sendBtn: HTMLButtonElement | null = null;
  let isLoading = false;
  const messages: EmirMessage[] = [];

  function createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'emir-revision-panel';
    panel.className = 'emir-revision-panel';

    panel.innerHTML = `
      <div class="emir-revision-header">
        <span class="emir-revision-title">Revise Proposal</span>
        <button class="emir-revision-close" title="Close">&times;</button>
      </div>
      <div class="emir-revision-messages" id="emir-revision-messages"></div>
      <div class="emir-revision-input-area">
        <textarea
          id="emir-revision-input"
          class="emir-revision-input"
          placeholder="Select a page section then describe changes, or type for full-doc revision"
          rows="2"
        ></textarea>
        <button id="emir-revision-send" class="emir-revision-send" title="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    `;

    // Close button
    panel.querySelector('.emir-revision-close')?.addEventListener('click', () => {
      hidePanel();
    });

    messagesEl = panel.querySelector('#emir-revision-messages');
    inputEl = panel.querySelector('#emir-revision-input') as HTMLTextAreaElement;
    sendBtn = panel.querySelector('#emir-revision-send') as HTMLButtonElement;

    // Send on button click
    sendBtn?.addEventListener('click', handleSend);

    // Send on Ctrl/Cmd + Enter
    inputEl?.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    });

    return panel;
  }

  function renderMessages() {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';

    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'emir-revision-empty';
      empty.textContent = 'Describe changes you want to make to this proposal. Claude will revise the HTML while preserving your formatting.';
      messagesEl.appendChild(empty);
      return;
    }

    for (const msg of messages) {
      const el = document.createElement('div');
      el.className = `emir-revision-msg emir-revision-msg-${msg.role}`;
      el.textContent = msg.content;
      messagesEl.appendChild(el);
    }

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setLoading(loading: boolean) {
    isLoading = loading;
    if (sendBtn) sendBtn.disabled = loading;
    if (inputEl) inputEl.disabled = loading;

    // Show/hide loading indicator
    const existing = messagesEl?.querySelector('.emir-revision-loading');
    if (loading && !existing && messagesEl) {
      const loader = document.createElement('div');
      loader.className = 'emir-revision-loading';
      loader.textContent = 'Revising...';
      messagesEl.appendChild(loader);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (!loading && existing) {
      existing.remove();
    }
  }

  async function handleSend() {
    if (!inputEl || !ctx || isLoading) return;
    const message = inputEl.value.trim();
    if (!message) return;

    // Add user message to UI
    const userMsg: EmirMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      phase: 'revision',
      created_at: new Date().toISOString(),
    };
    messages.push(userMsg);
    renderMessages();
    inputEl.value = '';

    // Check if a page-level component is selected for section-level revision
    const selected = editor.getSelected();
    const pageEl = selected?.getEl();
    const isPageSection = pageEl && (
      pageEl.classList.contains('page') ||
      pageEl.closest('.page') !== null
    );

    setLoading(true);
    try {
      if (isPageSection && pageEl) {
        // Section-level revision — send only the selected section's HTML
        const sectionHtml = pageEl.classList.contains('page')
          ? pageEl.outerHTML
          : (pageEl.closest('.page') as HTMLElement)?.outerHTML || pageEl.outerHTML;

        const result = await api.emirReviseSection(
          ctx.emirApi, ctx.proposalId, sectionHtml, message, ctx.syncToken
        );

        // Replace the section in the editor
        const targetComponent = pageEl.classList.contains('page')
          ? selected!
          : findParentPage(selected!);
        if (!targetComponent) {
          throw new Error('Could not find the parent page section to replace');
        }
        targetComponent.replaceWith(result.section_html);

        const assistantMsg: EmirMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.changes_summary,
          phase: 'revision',
          created_at: new Date().toISOString(),
        };
        messages.push(assistantMsg);
        showToast('Section revised');
      } else {
        // Full-document revision (existing behavior)
        const currentHtml = getCurrentHtml();
        const result = await api.emirRevise(ctx.emirApi, ctx.proposalId, currentHtml, message, ctx.syncToken);

        const assistantMsg: EmirMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.changes_summary,
          phase: 'revision',
          created_at: new Date().toISOString(),
        };
        messages.push(assistantMsg);

        loadRevisedHtml(result.html);
        showToast(`Revised: ${result.sections_changed.join(', ') || 'proposal'}`);
      }
    } catch (err: any) {
      const errorMsg: EmirMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${err.message || 'Revision failed'}`,
        phase: 'revision',
        created_at: new Date().toISOString(),
      };
      messages.push(errorMsg);
      showToast('Revision failed', true);
    } finally {
      setLoading(false);
      renderMessages();
    }
  }

  /** Walk up GrapesJS component tree to find the .page parent */
  function findParentPage(component: any): any {
    let current = component;
    while (current) {
      const el = current.getEl?.();
      if (el?.classList?.contains('page')) return current;
      current = current.parent?.();
    }
    return null;
  }

  function getCurrentHtml(): string {
    // Use the recombineHtml from main.ts via the global
    const ps = (window as any).__pagesmith;
    if (ps && typeof ps.recombineHtml === 'function') {
      return ps.recombineHtml();
    }
    // Fallback: basic body + style extraction
    const body = editor.getHtml();
    const css = editor.getCss() ?? '';
    return `<!DOCTYPE html><html><head><style>${css}</style></head><body>${body}</body></html>`;
  }

  function loadRevisedHtml(html: string) {
    // Use the loadHtmlContent from main.ts via the global
    const ps = (window as any).__pagesmith;
    if (ps && typeof ps.loadHtmlContent === 'function') {
      const filename = new URLSearchParams(window.location.search).get('file') || 'proposal.html';
      ps.loadHtmlContent(html, filename);
      return;
    }
    // Fallback: direct component/style injection
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const css = styleMatch ? styleMatch[1] : '';
    editor.setComponents(bodyContent);
    editor.setStyle(css);
  }

  function showPanel() {
    if (!panelEl) {
      panelEl = createPanel();
      document.body.appendChild(panelEl);
      loadHistory();
    }
    panelEl.classList.add('emir-revision-panel-open');
  }

  function hidePanel() {
    panelEl?.classList.remove('emir-revision-panel-open');
  }

  function togglePanel() {
    if (panelEl?.classList.contains('emir-revision-panel-open')) {
      hidePanel();
    } else {
      showPanel();
    }
  }

  async function loadHistory() {
    if (!ctx) return;
    try {
      const history = await api.emirGetMessages(ctx.emirApi, ctx.proposalId, ctx.syncToken);
      // Only merge history if user hasn't sent messages while we were loading
      if (history.length > 0 && messages.length === 0) {
        messages.push(...history);
        renderMessages();
      }
    } catch {
      // Silently fail — empty history is fine
    }
  }

  // Expose toggle for toolbar button
  (window as any).__emirRevisionChat = { toggle: togglePanel, show: showPanel, hide: hidePanel };
}

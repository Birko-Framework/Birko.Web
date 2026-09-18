import { BaseComponent, define } from 'birko-web-core';
import { escapeHtml } from '../dom-utils';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  status?: 'sending' | 'sent' | 'error';
  /** Optional metadata rendered via slot (e.g. tool calls, attachments) */
  meta?: unknown;
}

export interface ChatConfig {
  /** Placeholder text for the input box */
  placeholder?: string;
  /** Whether to render message content as HTML (for markdown) */
  renderHtml?: boolean;
  /** Whether to show timestamps on messages */
  showTimestamps?: boolean;
  /** Whether to show the typing indicator */
  showTyping?: boolean;
  /** Label for the send button */
  sendLabel?: string;
  /** Max height of the message area before scrolling */
  maxHeight?: string;
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * `<b-chat>` — Reusable chat UI component.
 *
 * Provides: message list with auto-scroll, input box with send, typing indicator,
 * message bubbles (user/assistant sides), timestamps, streaming text support.
 *
 * API:
 * - `setMessages(messages)` — set full message list
 * - `addMessage(message)` — append a message
 * - `updateMessage(id, updates)` — update a message in-place (for streaming)
 * - `setTyping(isTyping)` — show/hide typing indicator
 * - `setConfig(config)` — configure appearance
 * - `clearMessages()` — clear all messages
 * - `focusInput()` — focus the input box
 *
 * Events:
 * - `send` — user submitted a message (detail: { text: string })
 * - `retry` — user clicked retry on an errored message (detail: { messageId: string })
 *
 * Slots:
 * - `header` — optional header content above messages
 * - `message-meta` — rendered inside each message that has `meta` set
 * - `footer` — optional footer content below input
 */
export class BChat extends BaseComponent {
  private _messages: ChatMessage[] = [];
  private _typing = false;
  private _config: ChatConfig = {};

  static get observedAttributes() {
    return ['disabled', 'placeholder'];
  }

  static get styles() {
    return `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        font-family: var(--b-font-family, system-ui, -apple-system, sans-serif);
        font-size: var(--b-text-base, 0.875rem);
        color: var(--b-text, #0f172a);
        background: var(--b-bg);
      }

      /* ── Header slot ── */
      .chat-header {
        flex-shrink: 0;
        border-bottom: var(--b-border-width, 1px) solid var(--b-border, #e2e8f0);
      }
      .chat-header:empty { display: none; }

      /* ── Message area ── */
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: var(--b-space-lg, 1rem);
        display: flex;
        flex-direction: column;
        gap: var(--b-space-sm, 0.5rem);
        scroll-behavior: smooth;
      }

      /* ── Message bubble ── */
      .message {
        display: flex;
        flex-direction: column;
        max-width: 80%;
        animation: msg-in var(--b-transition, 150ms ease);
      }
      .message.user {
        align-self: flex-end;
        align-items: flex-end;
      }
      .message.assistant, .message.system {
        align-self: flex-start;
        align-items: flex-start;
      }

      .bubble {
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        border-radius: var(--b-radius-lg, 0.625rem);
        line-height: 1.5;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .message.user .bubble {
        background: var(--b-color-primary, #2563eb);
        color: var(--b-text-inverse);
        border-bottom-right-radius: var(--b-radius-sm, 0.25rem);
      }
      .message.assistant .bubble {
        background: var(--b-bg-tertiary, #f1f5f9);
        color: var(--b-text, #0f172a);
        border-bottom-left-radius: var(--b-radius-sm, 0.25rem);
      }
      .message.system .bubble {
        background: transparent;
        color: var(--b-text-muted, #94a3b8);
        font-size: var(--b-text-sm, 0.8125rem);
        font-style: italic;
        padding: var(--b-space-xs, 0.25rem) 0;
      }
      .bubble.html-content p { margin: 0 0 0.5em; }
      .bubble.html-content p:last-child { margin: 0; }
      .bubble.html-content code {
        background: var(--b-backdrop-overlay, rgba(0, 0, 0, 0.06));
        padding: 0.1em 0.3em;
        border-radius: var(--b-radius-sm, 0.25rem);
        font-size: 0.9em;
      }
      .bubble.html-content pre {
        background: var(--b-bg-secondary, #f8fafc);
        padding: var(--b-space-sm, 0.5rem);
        border-radius: var(--b-radius, 0.375rem);
        overflow-x: auto;
        margin: 0.5em 0;
      }
      .bubble.html-content pre code {
        background: none;
        padding: 0;
      }

      .message-time {
        font-size: var(--b-text-xs, 0.6875rem);
        color: var(--b-text-muted, #94a3b8);
        margin-top: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-xs, 0.25rem);
      }

      .message-status {
        font-size: var(--b-text-xs, 0.6875rem);
        margin-top: var(--b-space-xs, 0.25rem);
        padding: 0 var(--b-space-xs, 0.25rem);
      }
      .message-status.error {
        color: var(--b-color-danger, #dc2626);
        cursor: pointer;
      }
      .message-status.error:hover { text-decoration: underline; }
      .message-status.sending { color: var(--b-text-muted, #94a3b8); }

      .message-meta {
        margin-top: var(--b-space-xs, 0.25rem);
        font-size: var(--b-text-sm, 0.8125rem);
      }

      /* ── Typing indicator ── */
      .typing {
        align-self: flex-start;
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        display: flex;
        gap: var(--b-space-xs, 0.25rem);
        align-items: center;
      }
      .typing.hidden { display: none; }
      .typing-dot {
        width: 0.375rem;
        height: 0.375rem;
        background: var(--b-text-muted, #94a3b8);
        border-radius: var(--b-radius-full, 9999px);
        animation: typing-bounce var(--b-animation-progress, 1.4s) infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }

      /* ── Input area ── */
      .chat-input {
        flex-shrink: 0;
        display: flex;
        gap: var(--b-space-sm, 0.5rem);
        padding: var(--b-space-md, 0.75rem) var(--b-space-lg, 1rem);
        border-top: var(--b-border-width, 1px) solid var(--b-border, #e2e8f0);
        background: var(--b-bg);
      }
      .chat-input textarea {
        flex: 1;
        border: var(--b-border-width, 1px) solid var(--b-border, #e2e8f0);
        border-radius: var(--b-radius-lg, 0.625rem);
        padding: var(--b-space-sm, 0.5rem) var(--b-space-md, 0.75rem);
        font-family: inherit;
        font-size: inherit;
        color: inherit;
        background: var(--b-bg);
        resize: none;
        min-height: 2.5rem;
        max-height: 8rem;
        line-height: 1.5;
        outline: none;
        transition: border-color var(--b-transition, 150ms ease);
      }
      .chat-input textarea:focus {
        border-color: var(--b-color-primary, #2563eb);
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
      }
      .chat-input textarea:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      .chat-input textarea::placeholder {
        color: var(--b-text-muted, #94a3b8);
      }
      .send-btn {
        align-self: flex-end;
        padding: var(--b-space-sm, 0.5rem) var(--b-space-lg, 1rem);
        background: var(--b-color-primary, #2563eb);
        color: var(--b-text-inverse);
        border: none;
        border-radius: var(--b-radius-lg, 0.625rem);
        font-family: inherit;
        font-size: var(--b-text-sm, 0.8125rem);
        font-weight: var(--b-font-weight-semibold, 600);
        cursor: pointer;
        transition: background var(--b-transition, 150ms ease);
        min-height: 2.5rem;
      }
      .send-btn:hover:not(:disabled) {
        background: var(--b-color-primary-hover, #1d4ed8);
      }
      .send-btn:disabled {
        opacity: var(--b-disabled-opacity, 0.5);
        cursor: not-allowed;
      }
      .send-btn:focus-visible {
        box-shadow: var(--b-focus-ring, 0 0 0 3px rgba(37, 99, 235, 0.15));
        outline: none;
      }

      /* ── Footer slot ── */
      .chat-footer:empty { display: none; }

      /* ── Empty state ── */
      .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--b-text-muted, #94a3b8);
        font-size: var(--b-text-sm, 0.8125rem);
      }

      /* ── Animations ── */
      @keyframes msg-in {
        from { opacity: 0; transform: translateY(0.5rem); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes typing-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .message, .typing-dot { animation: none; }
        .chat-messages { scroll-behavior: auto; }
      }
    `;
  }

  render() {
    const disabled = this.boolAttr('disabled');
    const placeholder = this._config.placeholder ?? this.attr('placeholder', 'Type a message...');
    const sendLabel = this._config.sendLabel ?? 'Send';
    const showTimestamps = this._config.showTimestamps !== false;

    const messagesHtml = this._messages.length === 0
      ? '<div class="empty-state">No messages yet</div>'
      : this._messages.map(m => this._renderMessage(m, showTimestamps)).join('');

    return `
      <div class="chat-header"><slot name="header"></slot></div>
      <div class="chat-messages" id="msgs">
        ${messagesHtml}
        <div class="typing ${this._typing ? '' : 'hidden'}" aria-live="polite" aria-label="Typing">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
      <div class="chat-input">
        <textarea id="input"
          placeholder="${placeholder}"
          rows="1"
          ${disabled ? 'disabled' : ''}
          aria-label="${placeholder}"></textarea>
        <button class="send-btn" id="send-btn" ${disabled ? 'disabled' : ''}>${sendLabel}</button>
      </div>
      <div class="chat-footer"><slot name="footer"></slot></div>
    `;
  }

  private _renderMessage(m: ChatMessage, showTimestamps: boolean): string {
    const renderHtml = this._config.renderHtml && m.role === 'assistant';
    const bubbleClass = renderHtml ? 'bubble html-content' : 'bubble';
    const content = renderHtml ? m.content : escapeHtml(m.content);

    let statusHtml = '';
    if (m.status === 'sending') {
      statusHtml = '<div class="message-status sending">Sending...</div>';
    } else if (m.status === 'error') {
      statusHtml = `<div class="message-status error" data-retry="${m.id}">Failed. Click to retry.</div>`;
    }

    let timeHtml = '';
    if (showTimestamps && m.timestamp) {
      const time = new Date(m.timestamp);
      timeHtml = `<div class="message-time">${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>`;
    }

    const metaHtml = m.meta ? `<div class="message-meta"><slot name="message-meta-${m.id}"></slot></div>` : '';

    return `
      <div class="message ${m.role}" data-id="${m.id}">
        <div class="${bubbleClass}">${content}</div>
        ${metaHtml}
        ${statusHtml}
        ${timeHtml}
      </div>`;
  }

  protected onUpdated() {
    const input = this.$<HTMLTextAreaElement>('#input');
    const sendBtn = this.$<HTMLButtonElement>('#send-btn');

    if (input) {
      this.listen(input, 'keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          this._send();
        }
      });
      // Auto-resize textarea
      this.listen(input, 'input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 128) + 'px';
      });
    }

    if (sendBtn) {
      this.listen(sendBtn, 'click', () => this._send());
    }

    // Retry click handlers
    const retryBtns = this.$$('.message-status.error');
    for (const btn of retryBtns) {
      this.listen(btn, 'click', () => {
        const msgId = (btn as HTMLElement).dataset.retry;
        if (msgId) this.emit('retry', { messageId: msgId });
      });
    }

    this._scrollToBottom();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setMessages(messages: ChatMessage[]) {
    this._messages = [...messages];
    this.update();
  }

  addMessage(message: ChatMessage) {
    this._messages.push(message);
    this.update();
  }

  updateMessage(id: string, updates: Partial<ChatMessage>) {
    const msg = this._messages.find(m => m.id === id);
    if (msg) {
      Object.assign(msg, updates);
      // Optimized: update just the bubble content without full re-render
      const el = this.$(`[data-id="${id}"] .bubble`);
      if (el && updates.content !== undefined) {
        const renderHtml = this._config.renderHtml && msg.role === 'assistant';
        if (renderHtml) {
          el.innerHTML = updates.content;
          el.classList.add('html-content');
        } else {
          el.textContent = updates.content;
        }
        this._scrollToBottom();
      } else {
        this.update();
      }
    }
  }

  setTyping(isTyping: boolean) {
    this._typing = isTyping;
    const el = this.$('.typing');
    if (el) {
      el.classList.toggle('hidden', !isTyping);
      if (isTyping) this._scrollToBottom();
    }
  }

  setConfig(config: ChatConfig) {
    this._config = { ...this._config, ...config };
    this.update();
  }

  clearMessages() {
    this._messages = [];
    this.update();
  }

  focusInput() {
    this.$<HTMLTextAreaElement>('#input')?.focus();
  }

  getMessages(): ChatMessage[] {
    return [...this._messages];
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private _send() {
    const input = this.$<HTMLTextAreaElement>('#input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    this.emit('send', { text });
  }

  private _scrollToBottom() {
    const msgs = this.$('#msgs');
    if (msgs) {
      requestAnimationFrame(() => {
        msgs.scrollTop = msgs.scrollHeight;
      });
    }
  }

}

define('b-chat', BChat);

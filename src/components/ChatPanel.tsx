import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, PlanOperation } from '../types';

interface Props {
  status: { configured: boolean; model: string; reason?: string } | null;
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
  describeOp: (op: PlanOperation) => string;
}

const SUGGESTIONS = ['One more night at the last stop', 'Shorter drive on day 2', 'Add a lookout to day 3', 'Skip the first stop'];

export function ChatPanel({ status, messages, busy, onSend, describeOp }: Props) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);
  const off = status && !status.configured;

  const submit = (t: string) => {
    if (!t.trim() || busy || off) return;
    onSend(t.trim());
    setText('');
  };

  return (
    <aside className="chat" aria-label="Change the plan with Claude">
      <h2>Change it with Claude</h2>
      {off ? (
        <div className="notice" role="status">
          {status?.reason === 'no-cli' ? (
            <>
              <strong>Claude chat is off.</strong> The chat uses your Claude login through Claude Code, and the <code>claude</code> command
              isn't installed on this machine. Install Claude Code, run <code>claude auth login</code>, then reload.
            </>
          ) : (
            <>
              <strong>Claude chat is off.</strong> The chat uses your Claude login, and Claude Code isn't signed in. Run{' '}
              <code>claude auth login</code> in a terminal, then reload. Everything else works without it.
            </>
          )}
        </div>
      ) : (
        <p className="muted small">Ask for changes like “one more night here” or “skip the long drive on day 2”. {status ? `Uses your Claude login (${status.model}).` : ''}</p>
      )}

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'err' : ''}`}>
            <div>{m.content}</div>
            {m.operations && m.operations.length > 0 && (
              <ul className="ops">
                {m.operations.map((op, j) => (
                  <li key={j}>{describeOp(op)}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant muted">Thinking…</div>}
        <div ref={end} />
      </div>

      {!off && messages.length === 0 && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => submit(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder={off ? 'Chat is off: Claude Code is not signed in' : 'Ask Claude to change the plan…'}
          disabled={!!off}
          rows={2}
          aria-label="Message to Claude"
        />
        <button className="primary" type="submit" disabled={!!off || busy || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}

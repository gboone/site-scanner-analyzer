import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { View } from '../App';

interface Props {
  onNavigate: (view: View) => void;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  tools_used?: string[];
}

const SUGGESTIONS = [
  'How many sites use the U.S. Web Design System?',
  'Which agencies have the most public websites?',
  'What CMS platforms are most common across .gov sites?',
  'Show HTTPS enforcement stats for the VA.',
];

export default function ChatView({ onNavigate }: Props) {
  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
  const hasKey = !!(settings as Record<string, string>).ANTHROPIC_API_KEY;

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, loading]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    const next: Turn[] = [...turns, { role: 'user', content: trimmed }];
    setTurns(next);
    setDraft('');
    setLoading(true);
    try {
      const payload = next.map((t) => ({ role: t.role, content: t.content }));
      const res = await api.chat(payload);
      setTurns((prev) => [...prev, { role: 'assistant', content: res.reply, tools_used: res.tools_used }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Chat</h1>
          <p className="text-xs text-gray-500">Ask questions about the site scan data — Claude queries it for you.</p>
        </div>
        {turns.length > 0 && (
          <button onClick={() => { setTurns([]); setError(null); }} className="btn-secondary text-xs">
            New chat
          </button>
        )}
      </div>

      {!hasKey ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-sm text-gray-600 mb-3">
              Chat needs an Anthropic API key. Add one in Settings to get started.
            </p>
            <button onClick={() => onNavigate('settings')} className="btn-primary text-xs">
              Go to Settings
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {turns.length === 0 && (
              <div className="max-w-2xl mx-auto pt-8">
                <p className="text-sm text-gray-500 mb-3">Try asking:</p>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-gov-blue hover:bg-blue-50/40 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`max-w-2xl mx-auto w-full flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                    t.role === 'user'
                      ? 'bg-gov-blue text-white max-w-[80%]'
                      : 'bg-white border border-gray-200 text-gray-800 max-w-[90%]'
                  }`}
                >
                  {t.content}
                  {t.role === 'assistant' && t.tools_used && t.tools_used.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
                      Queried: {[...new Set(t.tools_used)].join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="max-w-2xl mx-auto w-full flex justify-start">
                <div className="rounded-lg px-3.5 py-2.5 text-sm bg-white border border-gray-200 text-gray-400">
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <div className="max-w-2xl mx-auto w-full">
                <div className="rounded-lg px-3.5 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">
                  {error}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white px-6 py-3">
            <div className="max-w-2xl mx-auto flex gap-2 items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask about the data… (Enter to send, Shift+Enter for newline)"
                aria-label="Chat message"
                className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gov-blue max-h-40"
              />
              <button
                onClick={() => send(draft)}
                disabled={loading || !draft.trim()}
                className="btn-primary text-sm disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

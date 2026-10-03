import { useI18n } from '../i18n';
// ChatPanel — explanation-only chat with local conversational history.

import { useState, useRef, useEffect, useCallback } from 'react';
import type { EvidenceItem } from '../types/contracts';
import { sendChat, ApiRequestError } from '../api';
import { fixtureSendChat, isFixtureMode } from '../fixtures';

export interface ChatPanelProps {
  zoneId: string | null;
  observationId: string | null;
  onOpenEvidence: (evidence: EvidenceItem) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  evidence: EvidenceItem[];
  limitations: string[];
  isError: boolean;
  errorText?: string;
}

const SUGGESTED_QUESTIONS = [
  'Explain this observation',
  'Why does this zone need attention?',
  'Which measurements are missing?',
];

let messageIdCounter = 0;

export function ChatPanel({ zoneId, observationId, onOpenEvidence }: ChatPanelProps) {
  const { t, language } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextLabel, setContextLabel] = useState<string>('');

  const conversationIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Update context label
  useEffect(() => {
    if (observationId) {
      setContextLabel(`${t('observation')}: ${observationId}`);
    } else if (zoneId) {
      setContextLabel(`${t('Zone')}: ${zoneId}`);
    } else {
      setContextLabel('');
    }
  }, [zoneId, observationId, language]);

  // Abort pending request and start fresh conversation on context change
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    conversationIdRef.current = null;
    setMessages([]);
    setError(null);
    setIsPending(false);
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [zoneId, observationId, language]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isPending || abortControllerRef.current) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessage: ChatMessage = {
        id: `msg-${++messageIdCounter}`,
        role: 'user',
        text: text.trim(),
        evidence: [],
        limitations: [],
        isError: false,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsPending(true);
      setError(null);

      try {
        const response = isFixtureMode()
          ? await fixtureSendChat({
              message: text.trim(),
              language,
              zone_id: zoneId ?? undefined,
              observation_id: observationId ?? undefined,
              conversation_id: conversationIdRef.current ?? undefined,
            })
          : await sendChat({
              message: text.trim(),
              language,
              zone_id: zoneId ?? undefined,
              observation_id: observationId ?? undefined,
              conversation_id: conversationIdRef.current ?? undefined,
            }, controller.signal);

        if (controller.signal.aborted || abortControllerRef.current !== controller) return;

        conversationIdRef.current = response.conversation_id;

        const assistantMessage: ChatMessage = {
          id: `msg-${++messageIdCounter}`,
          role: 'assistant',
          text: response.answer,
          evidence: response.evidence,
          limitations: response.limitations,
          isError: false,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: unknown) {
        if (controller.signal.aborted || abortControllerRef.current !== controller) return;
        const errorMsg = err instanceof ApiRequestError ? err.message : t('Failed to send message');
        setError(errorMsg);

        const assistantErrorMessage: ChatMessage = {
          id: `msg-${++messageIdCounter}`,
          role: 'assistant',
          text: '',
          evidence: [],
          limitations: [],
          isError: true,
          errorText: errorMsg,
        };
        setMessages((prev) => [...prev, assistantErrorMessage]);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsPending(false);
          abortControllerRef.current = null;
        }
      }
    },
    [isPending, zoneId, observationId, language],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleRetry = () => {
    // Retry last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      sendMessage(lastUserMsg.text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <h3>{t("Ask about this observation")}</h3>
        {contextLabel && <span className="chat-panel__context">{contextLabel}</span>}
      </div>

      <div className="chat-panel__messages">
        {messages.length === 0 && (
          <div className="chat-panel__empty">
            <p>{t("Ask a question to get started.")}</p>
            <div className="chat-panel__suggestions">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="chat-panel__suggestion"
                  onClick={() => sendMessage(t(q))}
                  disabled={isPending}
                >
                  {t(q)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-panel__message chat-panel__message--${msg.role}`}>
            {msg.isError ? (
              <div className="chat-panel__error">
                <p role="alert">{t(msg.errorText ?? error ?? "unknown error")}</p>
                <button onClick={handleRetry} className="chat-panel__retry">
                  {t("Retry")}
                </button>
              </div>
            ) : (
              <>
                <p className="chat-panel__text">{msg.text}</p>
                {msg.limitations.length > 0 && (
                  <div className="chat-panel__limitations">
                    {msg.limitations.map((lim, i) => (
                      <span key={i} className="chat-panel__limitation">
                        {t(lim)}
                      </span>
                    ))}
                  </div>
                )}
                {msg.evidence.length > 0 && (
                  <div className="chat-panel__evidence">
                    {msg.evidence.map((ev) => (
                      <button
                        key={ev.id}
                        className="chat-panel__evidence-chip"
                        onClick={() => onOpenEvidence(ev)}
                      >
                        {t(ev.kind)}: {t(ev.title)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-panel__input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("Ask a question...")}
          aria-label={t("Question for local AI")}
          disabled={isPending}
          className="chat-panel__input"
        />
        <button type="submit" disabled={isPending || !input.trim()} className="chat-panel__send">
          {isPending ? '...' : t('Send')}
        </button>
      </form>
    </div>
  );
}

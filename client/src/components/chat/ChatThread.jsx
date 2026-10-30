import { useEffect, useRef } from 'react';
import MarkdownContent from '../MarkdownContent.jsx';

// One message. The other side's messages are Markdown; the student's text is shown as
// typed. Each says who wrote it in words ("You" or assistant_label), not only by its
// color and side.
function ChatMessage({ role, content, assistant_label }) {
  const is_student = role === 'user';
  return (
    <li className={`flex flex-col gap-1 ${is_student ? 'items-end' : 'items-start'}`}>
      <span className="text-caption font-semibold text-ink-muted">{is_student ? 'You' : assistant_label}</span>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${is_student ? 'bg-brand-600 text-white' : 'border border-border bg-surface text-ink'}`}
      >
        {is_student ? <p className="whitespace-pre-wrap text-body">{content}</p> : <MarkdownContent markdown_text={content} />}
      </div>
    </li>
  );
}

// A lesson's conversation, newest at the bottom, scrolled to the latest message. While a
// reply is on its way the student's message shows straight away with "Thinking…" under
// it. assistant_label names the other side (the AI student).
function ChatThread({ messages, pending_question, assistant_label }) {
  const thread_ref = useRef(null);

  useEffect(() => {
    const thread_element = thread_ref.current;
    if (thread_element) thread_element.scrollTop = thread_element.scrollHeight;
  }, [messages.length, pending_question]);

  return (
    // The conversation scrolls, so it can take keyboard focus (tabIndex) for arrow-key scrolling.
    <div
      ref={thread_ref}
      role="log"
      aria-label="Conversation"
      tabIndex={0}
      className="max-h-[60vh] overflow-y-auto rounded-xl bg-canvas p-3 sm:p-4"
    >
      <ol className="flex flex-col gap-4">
        {messages.map((chat_message) => (
          <ChatMessage
            key={chat_message.id}
            role={chat_message.role}
            content={chat_message.content}
            assistant_label={assistant_label}
          />
        ))}
        {pending_question && (
          <>
            <ChatMessage role="user" content={pending_question} assistant_label={assistant_label} />
            <li>
              <p role="status" className="text-small text-ink-muted">
                Thinking…
              </p>
            </li>
          </>
        )}
      </ol>
    </div>
  );
}

export default ChatThread;

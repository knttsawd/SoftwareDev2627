import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render_in_router } from './helpers/render_helpers.jsx';

const {
  DEFAULT_SPEECH_ERROR,
  describe_speech_error,
  get_speech_recognition_class,
  read_transcript,
  use_speech_input,
} = await import('../src/hooks/use_speech_input.js');
const { default: VoiceInputButton } = await import('../src/components/VoiceInputButton.jsx');
const { append_spoken_text, is_send_key, default: ChatComposer } = await import('../src/components/chat/ChatComposer.jsx');
const { default: ChatThread } = await import('../src/components/chat/ChatThread.jsx');

const USER_MESSAGE = { id: 'm1', role: 'user', content: 'What is a cell?', created_at: 'now' };
const ASSISTANT_MESSAGE = { id: 'm2', role: 'assistant', content: 'A cell is the **smallest** unit of life.', created_at: 'now' };

// A stand-in for the browser's SpeechRecognition class that records each instance, so a
// test can play the browser's part by calling onresult, onerror and onend.
function create_fake_speech_window() {
  const instances = [];
  class FakeRecognition {
    constructor() {
      this.start = vi.fn();
      this.stop = vi.fn(() => this.onend());
      this.abort = vi.fn();
      instances.push(this);
    }
  }
  return { speech_window: { webkitSpeechRecognition: FakeRecognition, navigator: { language: 'en-GB' } }, instances };
}

// A recognition "result" event carrying the given phrases.
function build_speech_event(...phrases) {
  return { results: phrases.map((phrase) => [{ transcript: phrase }]) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('speech input helpers', () => {
  it('finds the browser speech class, standard or prefixed', () => {
    const StandardClass = vi.fn();
    expect(get_speech_recognition_class({ SpeechRecognition: StandardClass })).toBe(StandardClass);
    expect(get_speech_recognition_class({ webkitSpeechRecognition: StandardClass })).toBe(StandardClass);
    expect(get_speech_recognition_class({})).toBeNull();
  });

  it('explains errors the student can fix, and stays quiet when stopped on purpose', () => {
    expect(describe_speech_error('not-allowed')).toMatch('Microphone access is blocked');
    expect(describe_speech_error('aborted')).toBe('');
    expect(describe_speech_error('something-new')).toBe(DEFAULT_SPEECH_ERROR);
  });

  it('joins the words heard', () => {
    expect(read_transcript(build_speech_event('what is', 'a cell '))).toBe('what is a cell');
  });
});

describe('use_speech_input', () => {
  it('listens once, passes on the words, and stops listening at the end', () => {
    const { speech_window, instances } = create_fake_speech_window();
    const on_transcript = vi.fn();
    const { result } = renderHook(() => use_speech_input(on_transcript, speech_window));

    expect(result.current.is_supported).toBe(true);
    act(() => result.current.start());
    expect(result.current.is_listening).toBe(true);
    expect(instances[0]).toMatchObject({ lang: 'en-GB', interimResults: false, continuous: false });
    expect(instances[0].start).toHaveBeenCalled();

    act(() => instances[0].onresult(build_speech_event('osmosis')));
    act(() => result.current.stop());

    expect(on_transcript).toHaveBeenCalledWith('osmosis');
    expect(result.current.is_listening).toBe(false);
  });

  it('reports errors and stops when the component goes away', () => {
    const { speech_window, instances } = create_fake_speech_window();
    const { result, unmount } = renderHook(() => use_speech_input(vi.fn(), speech_window));

    act(() => result.current.start());
    act(() => instances[0].onerror({ error: 'no-speech' }));
    expect(result.current.error_message).toMatch("I didn't hear anything");

    unmount();
    expect(instances[0].abort).toHaveBeenCalled();
  });

  it('does nothing in browsers without speech recognition', () => {
    const { result } = renderHook(() => use_speech_input(vi.fn(), {}));

    expect(result.current.is_supported).toBe(false);
    expect(() => act(() => result.current.start())).not.toThrow();
  });
});

describe('VoiceInputButton', () => {
  it('is hidden without speech recognition', () => {
    const { container } = render(<VoiceInputButton on_transcript={vi.fn()} speech_window={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('starts and stops listening, saying so in words', async () => {
    const { speech_window, instances } = create_fake_speech_window();
    const on_transcript = vi.fn();
    render(<VoiceInputButton on_transcript={on_transcript} speech_window={speech_window} />);

    await userEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' }));
    expect(screen.getByRole('status')).toHaveTextContent('Listening…');
    act(() => instances[0].onresult(build_speech_event('mitosis')));
    await userEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    expect(on_transcript).toHaveBeenCalledWith('mitosis');
    expect(screen.getByRole('button', { name: 'Speak instead of typing' })).toBeInTheDocument();
  });
});

describe('ChatComposer', () => {
  it('adds spoken words after typed ones', () => {
    expect(append_spoken_text('', 'hello')).toBe('hello');
    expect(append_spoken_text('What is  ', 'a cell')).toBe('What is a cell');
  });

  it('sends on Enter but not Shift+Enter or while composing', () => {
    expect(is_send_key({ key: 'Enter', shiftKey: false })).toBe(true);
    expect(is_send_key({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(is_send_key({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true } })).toBe(false);
    expect(is_send_key({ key: 'a', shiftKey: false })).toBe(false);
  });

  it('sends with Enter or the button, only when there is text', async () => {
    const on_send = vi.fn();
    const { rerender } = render(<ChatComposer draft="" set_draft={vi.fn()} is_sending={false} on_send={on_send} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    rerender(<ChatComposer draft="Hi" set_draft={vi.fn()} is_sending={false} on_send={on_send} />);
    await userEvent.type(screen.getByLabelText('Your message'), '{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await userEvent.type(screen.getByLabelText('Your message'), '{Shift>}{Enter}{/Shift}');

    expect(on_send).toHaveBeenCalledTimes(2);
  });

  it('shows that a message is on its way', () => {
    render(<ChatComposer draft="Hi" set_draft={vi.fn()} is_sending on_send={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });
});

describe('ChatThread', () => {
  it('labels who wrote each message and shows the AI student in Markdown', () => {
    render(
      <ChatThread messages={[USER_MESSAGE, ASSISTANT_MESSAGE]} pending_question="And a tissue?" assistant_label="Pip" />,
    );

    const conversation = screen.getByRole('log', { name: 'Conversation' });
    const [first_message, second_message] = within(conversation).getAllByRole('listitem');
    expect(first_message).toHaveTextContent('YouWhat is a cell?');
    expect(second_message).toHaveTextContent('PipA cell is the smallest unit of life.');
    expect(within(second_message).getByText('smallest').tagName).toBe('STRONG');
    expect(screen.getByText('And a tissue?')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Thinking…');
  });
});


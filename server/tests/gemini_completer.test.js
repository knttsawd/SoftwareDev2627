import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { GEMINI_INLINE_MEDIA_MAX_BYTES } from '../config/constants.js';
import { AI_ERROR_KIND } from '../services/ai/ai_errors.js';
import {
  create_client_rotation,
  create_gemini_completer,
  create_gemini_transcriber,
  get_gemini_error_kind,
  get_media_type,
  is_key_specific_gemini_error,
  is_retryable_gemini_error,
  is_retryable_transcription_error,
  map_gemini_error,
  parse_gemini_json,
  prepare_media_part,
  read_transcript_text,
  run_with_model_fallback,
  transcribe_with_model,
  wait_for_file_ready,
} from '../services/ai/gemini_completer.js';

const MODEL_CHAINS = { light: ['lite-1', 'lite-2'], standard: ['flash-1', 'lite-1'] };

// A Gemini error with the given HTTP status, like the SDK throws.
function create_api_error(status, message = 'error') {
  return new ApiError({ status, message });
}

// A Gemini reply holding JSON text, finishing normally unless finish_reason says otherwise.
function create_json_reply(json_value, finish_reason = 'STOP') {
  return { text: JSON.stringify(json_value), candidates: [{ finishReason: finish_reason }] };
}

// A Gemini reply holding the given transcript parts.
function create_transcript_reply(reply_parts) {
  return { candidates: [{ content: { parts: reply_parts } }] };
}

// A fake Gemini client whose generateContent answers with each result in turn
// (an Error in the list is thrown instead).
function create_fake_gemini_client(results = []) {
  const remaining_results = [...results];
  return {
    models: {
      generateContent: vi.fn(async () => {
        const next_result = remaining_results.shift();
        if (next_result instanceof Error) throw next_result;
        return next_result;
      }),
    },
    files: {
      upload: vi.fn(async () => ({ name: 'files/abc', state: 'ACTIVE', uri: 'https://files/abc' })),
      get: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
  };
}

describe('Gemini error sorting', () => {
  it('spots a rejected key, a busy model, and anything else', () => {
    expect(get_gemini_error_kind(create_api_error(400, 'API key not valid. Please pass a valid API key.'))).toBe(AI_ERROR_KIND.auth);
    expect(get_gemini_error_kind(create_api_error(403))).toBe(AI_ERROR_KIND.auth);
    expect(get_gemini_error_kind(create_api_error(429))).toBe(AI_ERROR_KIND.busy);
    expect(get_gemini_error_kind(create_api_error(503))).toBe(AI_ERROR_KIND.busy);
    expect(get_gemini_error_kind(create_api_error(400, 'invalid argument'))).toBe(AI_ERROR_KIND.other);
    expect(get_gemini_error_kind(new Error('offline'))).toBe(AI_ERROR_KIND.other);
  });

  it('maps errors to student messages naming GEMINI_API_KEY', () => {
    expect(map_gemini_error(create_api_error(403)).message).toMatch('Check GEMINI_API_KEY');
    expect(map_gemini_error(create_api_error(429)).status).toBe(503);
  });

  it('decides which errors are worth trying the next model for', () => {
    expect(is_retryable_gemini_error(create_api_error(503))).toBe(true);
    expect(is_retryable_gemini_error(create_api_error(400))).toBe(false);
    expect(is_retryable_transcription_error(create_api_error(400))).toBe(true);
    expect(is_retryable_transcription_error({ is_empty_transcript: true })).toBe(true);
    expect(is_retryable_transcription_error(create_api_error(403))).toBe(false);
  });
});

describe('run_with_model_fallback', () => {
  it('moves to the next model when one is busy', async () => {
    const run_model = vi.fn().mockRejectedValueOnce(create_api_error(503)).mockResolvedValueOnce('answer');

    await expect(run_with_model_fallback(['a', 'b'], run_model)).resolves.toBe('answer');
    expect(run_model.mock.calls).toEqual([['a'], ['b']]);
  });

  it('stops at once for errors another model would not fix', async () => {
    const run_model = vi.fn().mockRejectedValue(create_api_error(403));

    await expect(run_with_model_fallback(['a', 'b'], run_model)).rejects.toMatchObject({ status: 403 });
    expect(run_model).toHaveBeenCalledTimes(1);
  });

  it('throws the last error when every model fails', async () => {
    const run_model = vi.fn().mockRejectedValueOnce(create_api_error(503)).mockRejectedValueOnce(create_api_error(429));

    await expect(run_with_model_fallback(['a', 'b'], run_model)).rejects.toMatchObject({ status: 429 });
  });
});

describe('parse_gemini_json', () => {
  it('parses a normal answer', () => {
    expect(parse_gemini_json(create_json_reply({ notes_markdown: '# Hi' }))).toEqual({ notes_markdown: '# Hi' });
  });

  it('refuses blocked and cut-off answers', () => {
    expect(() => parse_gemini_json(create_json_reply({}, 'SAFETY'))).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => parse_gemini_json({ promptFeedback: { blockReason: 'OTHER' }, candidates: [] })).toThrow(
      expect.objectContaining({ status: 422 }),
    );
    expect(() => parse_gemini_json(create_json_reply({}, 'MAX_TOKENS'))).toThrow(expect.objectContaining({ status: 502 }));
  });
});

describe('create_gemini_completer', () => {
  const request = { system_prompt: 'sys', user_prompt: 'user', json_schema: { type: 'object' } };

  it('uses the model list and thinking level for the task tier', async () => {
    const gemini_client = create_fake_gemini_client([create_json_reply({ questions: [] })]);
    const complete_json = create_gemini_completer({ model_chains: MODEL_CHAINS, gemini_clients: [gemini_client] });

    await expect(complete_json({ ...request, task_tier: 'standard' })).resolves.toEqual({ questions: [] });
    expect(gemini_client.models.generateContent).toHaveBeenCalledWith({
      model: 'flash-1',
      contents: 'user',
      config: {
        systemInstruction: 'sys',
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
    });
  });

  it('falls back to the next model in the tier when the first is busy', async () => {
    const gemini_client = create_fake_gemini_client([create_api_error(503), create_json_reply({ notes_markdown: 'x' })]);
    const complete_json = create_gemini_completer({ model_chains: MODEL_CHAINS, gemini_clients: [gemini_client] });

    await complete_json({ ...request, task_tier: 'light' });

    expect(gemini_client.models.generateContent.mock.calls.map(([call]) => call.model)).toEqual(['lite-1', 'lite-2']);
    expect(gemini_client.models.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('turns failures into student messages', async () => {
    const gemini_client = create_fake_gemini_client([create_api_error(429), create_api_error(429)]);
    const complete_json = create_gemini_completer({ model_chains: MODEL_CHAINS, gemini_clients: [gemini_client] });

    await expect(complete_json({ ...request, task_tier: 'light' })).rejects.toMatchObject({
      status: 503,
      message: 'The AI is busy right now. Please try again in a minute.',
    });
  });
});

describe('several API keys', () => {
  const request = { system_prompt: 'sys', user_prompt: 'user', json_schema: { type: 'object' } };

  it('takes turns over the keys, each request starting one further along', () => {
    const take_turn = create_client_rotation(['a', 'b', 'c']);
    expect([take_turn(), take_turn(), take_turn(), take_turn()]).toEqual([
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
      ['a', 'b', 'c'],
    ]);
  });

  it('only moves to another key when that may help: out of quota or a refused key', () => {
    expect([429, 401, 403].map((status) => is_key_specific_gemini_error(create_api_error(status)))).toEqual([true, true, true]);
    expect(is_key_specific_gemini_error(create_api_error(400, 'API key not valid.'))).toBe(true);
    expect(is_key_specific_gemini_error(create_api_error(503))).toBe(false);
    expect(is_key_specific_gemini_error(new Error('429'))).toBe(false);
  });

  it('tries the same model with the next key before a weaker model, and spreads requests over the keys', async () => {
    const first_key = create_fake_gemini_client([create_api_error(429), create_json_reply({ notes_markdown: 'second request' })]);
    const second_key = create_fake_gemini_client([create_json_reply({ notes_markdown: 'first request' })]);
    const complete_json = create_gemini_completer({ model_chains: MODEL_CHAINS, gemini_clients: [first_key, second_key] });

    await expect(complete_json({ ...request, task_tier: 'light' })).resolves.toEqual({ notes_markdown: 'first request' });
    expect(first_key.models.generateContent.mock.calls[0][0].model).toBe('lite-1');
    expect(second_key.models.generateContent.mock.calls[0][0].model).toBe('lite-1');

    // The next request starts with the second key; out of answers, it throws, so the first key answers.
    second_key.models.generateContent.mockRejectedValueOnce(create_api_error(429));
    await expect(complete_json({ ...request, task_tier: 'light' })).resolves.toEqual({ notes_markdown: 'second request' });
    expect(second_key.models.generateContent).toHaveBeenCalledTimes(2);
  });

  it('stops at an error another key cannot fix, like a model that is down', async () => {
    const first_key = create_fake_gemini_client([create_api_error(503), create_json_reply({ notes_markdown: 'from lite-2' })]);
    const second_key = create_fake_gemini_client();
    const complete_json = create_gemini_completer({ model_chains: MODEL_CHAINS, gemini_clients: [first_key, second_key] });

    await expect(complete_json({ ...request, task_tier: 'light' })).resolves.toEqual({ notes_markdown: 'from lite-2' });
    expect(second_key.models.generateContent).not.toHaveBeenCalled();
  });

  it('transcribes with the next key when the first is out of quota', async () => {
    const first_key = create_fake_gemini_client([create_api_error(429)]);
    const second_key = create_fake_gemini_client([create_transcript_reply([{ text: 'Hello.' }])]);
    const transcriber = create_gemini_transcriber({ model_chain: ['a'], gemini_clients: [first_key, second_key] });

    await expect(transcriber.transcribe(Buffer.from('audio'), 'talk.mp3')).resolves.toBe('Hello.');
  });
});

describe('transcript helpers', () => {
  it('maps recording file names to media types', () => {
    expect(get_media_type('Lecture.MP3')).toBe('audio/mp3');
    expect(get_media_type('class.mp4')).toBe('video/mp4');
  });

  it('reads both speech-model and general-model replies', () => {
    expect(read_transcript_text(create_transcript_reply([{ audioTranscription: { text: 'Hello class.' } }]))).toBe('Hello class.');
    expect(read_transcript_text(create_transcript_reply([{ text: ' Hello ' }, { text: 'again.' }]))).toBe('Hello again.');
    expect(read_transcript_text({})).toBe('');
  });
});

describe('wait_for_file_ready', () => {
  it('returns at once for a ready file and polls a processing one', async () => {
    const gemini_client = create_fake_gemini_client();
    gemini_client.files.get.mockResolvedValue({ name: 'files/abc', state: 'ACTIVE' });

    await expect(wait_for_file_ready(gemini_client, { name: 'files/abc', state: 'ACTIVE' }, 0)).resolves.toMatchObject({ state: 'ACTIVE' });
    await expect(wait_for_file_ready(gemini_client, { name: 'files/abc', state: 'PROCESSING' }, 0)).resolves.toMatchObject({ state: 'ACTIVE' });
    expect(gemini_client.files.get).toHaveBeenCalledWith({ name: 'files/abc' });
  });

  it('fails when processing fails', async () => {
    await expect(wait_for_file_ready(create_fake_gemini_client(), { name: 'files/abc', state: 'FAILED' }, 0)).rejects.toMatchObject({
      status: 502,
    });
  });
});

describe('prepare_media_part', () => {
  it('sends small recordings inside the request', async () => {
    const gemini_client = create_fake_gemini_client();

    const prepared_media = await prepare_media_part(gemini_client, Buffer.from('audio'), 'audio/mp3');

    expect(prepared_media).toEqual({
      media_part: { inlineData: { mimeType: 'audio/mp3', data: Buffer.from('audio').toString('base64') } },
      uploaded_file_name: null,
    });
    expect(gemini_client.files.upload).not.toHaveBeenCalled();
  });

  it('uploads large recordings first', async () => {
    const gemini_client = create_fake_gemini_client();

    const prepared_media = await prepare_media_part(gemini_client, Buffer.alloc(GEMINI_INLINE_MEDIA_MAX_BYTES + 1), 'video/mp4');

    expect(gemini_client.files.upload).toHaveBeenCalledWith(expect.objectContaining({ config: { mimeType: 'video/mp4' } }));
    expect(prepared_media).toEqual({
      media_part: { fileData: { fileUri: 'https://files/abc', mimeType: 'video/mp4' } },
      uploaded_file_name: 'files/abc',
    });
  });
});

describe('transcribe_with_model', () => {
  it('returns the transcript and reads video at low resolution', async () => {
    const gemini_client = create_fake_gemini_client([create_transcript_reply([{ text: 'Words.' }])]);

    await expect(transcribe_with_model(gemini_client, 'lite-1', { inlineData: {} }, 'video/mp4')).resolves.toBe('Words.');
    expect(gemini_client.models.generateContent.mock.calls[0][0].config).toEqual({ mediaResolution: 'MEDIA_RESOLUTION_LOW' });
  });

  it('treats an empty transcript as a failure of that model', async () => {
    const gemini_client = create_fake_gemini_client([create_transcript_reply([])]);

    await expect(transcribe_with_model(gemini_client, 'lite-1', { inlineData: {} }, 'audio/mp3')).rejects.toMatchObject({
      is_empty_transcript: true,
    });
  });
});

describe('create_gemini_transcriber', () => {
  it('tries the next model when one hears nothing', async () => {
    const gemini_client = create_fake_gemini_client([create_transcript_reply([]), create_transcript_reply([{ text: 'Hello.' }])]);
    const transcriber = create_gemini_transcriber({ model_chain: ['a', 'b'], gemini_clients: [gemini_client] });

    await expect(transcriber.transcribe(Buffer.from('audio'), 'talk.mp3')).resolves.toBe('Hello.');
    expect(transcriber.name).toBe('gemini');
  });

  it('returns an empty transcript when no model hears speech, so the importer can explain', async () => {
    const gemini_client = create_fake_gemini_client([create_transcript_reply([]), create_transcript_reply([])]);
    const transcriber = create_gemini_transcriber({ model_chain: ['a', 'b'], gemini_clients: [gemini_client] });

    await expect(transcriber.transcribe(Buffer.from('audio'), 'silence.wav')).resolves.toBe('');
  });

  it('deletes uploaded recordings afterwards, even when transcription fails', async () => {
    const gemini_client = create_fake_gemini_client([create_api_error(403)]);
    const transcriber = create_gemini_transcriber({ model_chain: ['a'], gemini_clients: [gemini_client] });

    await expect(transcriber.transcribe(Buffer.alloc(GEMINI_INLINE_MEDIA_MAX_BYTES + 1), 'long.mp3')).rejects.toThrow(
      'Check GEMINI_API_KEY',
    );
    expect(gemini_client.files.delete).toHaveBeenCalledWith({ name: 'files/abc' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_CLIENT_ORIGIN,
  DEFAULT_DATABASE_PATH,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PORT,
  DEFAULT_UPLOADS_PATH,
} from '../config/constants.js';
import { build_model_chain, parse_origin_list, read_choice, read_env, read_key_list } from '../config/env.js';

describe('read_choice', () => {
  it('returns an allowed value and names the options otherwise', () => {
    expect(read_choice('AI_PROVIDER', 'mock', ['mock', 'openai'])).toBe('mock');
    expect(() => read_choice('AI_PROVIDER', 'gemini', ['mock', 'openai'])).toThrow(
      'AI_PROVIDER must be one of: mock, openai (got "gemini")',
    );
  });
});

describe('build_model_chain', () => {
  it('puts the chosen model first without repeating it', () => {
    expect(build_model_chain('b', ['a', 'b'])).toEqual(['b', 'a']);
    expect(build_model_chain(undefined, ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('parse_origin_list', () => {
  it('splits a comma-separated list and drops blanks', () => {
    expect(parse_origin_list('https://a.app, https://b.app,')).toEqual(['https://a.app', 'https://b.app']);
    expect(parse_origin_list('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });
});

describe('read_env', () => {
  it('uses defaults for everything when nothing is set, including the free mock AI', () => {
    expect(read_env({})).toEqual({
      port: DEFAULT_PORT,
      client_origin: [DEFAULT_CLIENT_ORIGIN],
      database_path: DEFAULT_DATABASE_PATH,
      uploads_path: DEFAULT_UPLOADS_PATH,
      ai: {
        provider: 'mock',
        transcription_provider: 'mock',
        gemini_api_key: undefined,
        gemini_api_keys: [],
        gemini_models: DEFAULT_GEMINI_MODELS,
        anthropic_api_key: undefined,
        anthropic_model: DEFAULT_ANTHROPIC_MODEL,
        openai_api_key: undefined,
        openai_model: DEFAULT_OPENAI_MODEL,
      },
    });
  });

  it('uses each variable when set', () => {
    const env = read_env({
      PORT: '5050',
      CLIENT_ORIGIN: 'https://studyapp.vercel.app, https://studyapp-git-main.vercel.app',
      DATABASE_PATH: '/var/data/studyapp.db',
      UPLOADS_PATH: '/var/data/uploads',
      AI_PROVIDER: 'gemini',
      TRANSCRIPTION_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'gemini-key',
      GEMINI_BACKUP_API_KEYS: 'backup-key',
      GEMINI_STANDARD_MODEL: 'gemini-test-pro',
      ANTHROPIC_API_KEY: 'anthropic-key',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_MODEL: 'gpt-test',
    });

    expect(env.port).toBe(5050);
    expect(env.client_origin).toEqual(['https://studyapp.vercel.app', 'https://studyapp-git-main.vercel.app']);
    expect(env.database_path).toBe('/var/data/studyapp.db');
    expect(env.ai).toEqual({
      provider: 'gemini',
      transcription_provider: 'gemini',
      gemini_api_key: 'gemini-key',
      gemini_api_keys: ['gemini-key', 'backup-key'],
      gemini_models: { ...DEFAULT_GEMINI_MODELS, standard: ['gemini-test-pro', ...DEFAULT_GEMINI_MODELS.standard] },
      anthropic_api_key: 'anthropic-key',
      anthropic_model: 'claude-sonnet-5-5',
      openai_api_key: 'openai-key',
      openai_model: 'gpt-test',
    });
  });

  it('lists every Gemini key, main key first, without blanks or repeats', () => {
    expect(read_key_list('main', ' backup-1, ,backup-2,main ')).toEqual(['main', 'backup-1', 'backup-2']);
    expect(read_key_list(undefined, 'only-backup')).toEqual(['only-backup']);
    expect(read_key_list(undefined, undefined)).toEqual([]);
  });

  it('refuses an unknown AI provider at startup', () => {
    expect(() => read_env({ AI_PROVIDER: 'llama' })).toThrow('AI_PROVIDER must be one of');
    expect(() => read_env({ TRANSCRIPTION_PROVIDER: 'anthropic' })).toThrow('TRANSCRIPTION_PROVIDER must be one of');
  });
});

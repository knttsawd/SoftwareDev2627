<<<<<<< Updated upstream
import { mkdtempSync, rmSync } from 'node:fs';
=======
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
>>>>>>> Stashed changes
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { create_app } from '../app.js';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { VALID_LEARNING_ANSWERS } from './helpers/learning_answers.js';
import { TEST_SIGNUP } from './helpers/test_accounts.js';

const CLIENT_ORIGIN = 'http://localhost:5173';

let app;
let uploads_path;

beforeEach(() => {
  uploads_path = mkdtempSync(path.join(tmpdir(), 'studyapp-uploads-'));
  app = create_app({ database: open_database(IN_MEMORY_DATABASE), uploads_path, client_origin: CLIENT_ORIGIN });
});

afterEach(() => {
  rmSync(uploads_path, { recursive: true, force: true });
});

// Signs up the test student through the API and returns the session token.
async function sign_up_test_student() {
  const response = await request(app).post('/api/auth/signup').send(TEST_SIGNUP);
  return response.body.token;
}

describe('GET /api/health', () => {
  it('reports ok and allows the client origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', CLIENT_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe(CLIENT_ORIGIN);
  });
});

describe('unknown routes', () => {
  it('respond 404 with JSON', async () => {
    const response = await request(app).get('/api/missing');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch('/api/missing');
  });
});

<<<<<<< Updated upstream
=======
describe('the built website', () => {
  let client_build_path;

  beforeEach(() => {
    client_build_path = mkdtempSync(path.join(tmpdir(), 'studyapp-client-'));
    writeFileSync(path.join(client_build_path, 'index.html'), '<div id="root"></div>');
    writeFileSync(path.join(client_build_path, 'app.js'), 'console.log("app");');
  });

  afterEach(() => {
    rmSync(client_build_path, { recursive: true, force: true });
  });

  it('serves its files, sends index.html for page paths and leaves /api alone', async () => {
    const site_app = create_app({
      database: open_database(IN_MEMORY_DATABASE),
      uploads_path,
      client_origin: CLIENT_ORIGIN,
      client_build_path,
    });

    const file_response = await request(site_app).get('/app.js');
    const page_response = await request(site_app).get('/dashboard/progress');
    const api_response = await request(site_app).get('/api/missing');

    expect(file_response.text).toBe('console.log("app");');
    expect(page_response.text).toBe('<div id="root"></div>');
    expect(api_response.status).toBe(404);
    expect(api_response.body.error).toMatch('/api/missing');
  });
});

>>>>>>> Stashed changes
describe('GET /api/auth/check-username', () => {
  it('reports whether the username is free', async () => {
    const before_signup = await request(app).get('/api/auth/check-username').query({ username: 'study_sam' });
    await sign_up_test_student();
    const after_signup = await request(app).get('/api/auth/check-username').query({ username: 'Study_Sam' });

    expect(before_signup.body).toEqual({ is_available: true });
    expect(after_signup.body).toEqual({ is_available: false });
  });

  it('rejects an invalid username', async () => {
    const response = await request(app).get('/api/auth/check-username').query({ username: 'a!' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/signup', () => {
  it('creates the account and returns a token and the account', async () => {
    const response = await request(app).post('/api/auth/signup').send(TEST_SIGNUP);

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.account).toMatchObject({ username: 'study_sam', email: 'sam@example.com' });
  });

  it('responds 400 with field errors for bad input', async () => {
    const response = await request(app).post('/api/auth/signup').send({ username: 'study_sam' });

    expect(response.status).toBe(400);
    expect(response.body.field_errors).toHaveProperty('email');
    expect(response.body.field_errors).not.toHaveProperty('username');
  });

  it('responds 409 when the email is already used', async () => {
    await sign_up_test_student();

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ ...TEST_SIGNUP, username: 'someone_else' });

    expect(response.status).toBe(409);
    expect(response.body.field_errors).toEqual({ email: 'An account with that email already exists' });
  });
});

describe('POST /api/auth/login', () => {
  it('returns a new token for the right password', async () => {
    await sign_up_test_student();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_SIGNUP.email, password: TEST_SIGNUP.password });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.account.username).toBe('study_sam');
  });

  it('responds 401 for a wrong password and 400 for missing fields', async () => {
    await sign_up_test_student();

    const wrong_password = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_SIGNUP.email, password: 'wrong' });
    const missing_fields = await request(app).post('/api/auth/login').send({});

    expect(wrong_password.status).toBe(401);
    expect(missing_fields.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session so the token stops working', async () => {
    const session_token = await sign_up_test_student();

    const logout_response = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${session_token}`);
    const account_response = await request(app).get('/api/account').set('Authorization', `Bearer ${session_token}`);

    expect(logout_response.status).toBe(204);
    expect(account_response.status).toBe(401);
  });
});

describe('/api/account', () => {
  it('requires a valid token', async () => {
    const response = await request(app).get('/api/account').set('Authorization', 'Bearer made-up');

    expect(response.status).toBe(401);
  });

  it('GET returns the signed-in account', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app).get('/api/account').set('Authorization', `Bearer ${session_token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ username: 'study_sam', first_name: 'Sam' });
  });

  it('PATCH updates the account', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app)
      .patch('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ first_name: 'Alex' });

    expect(response.status).toBe(200);
    expect(response.body.first_name).toBe('Alex');
  });

  it('PATCH responds 400 when nothing is sent', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app).patch('/api/account').set('Authorization', `Bearer ${session_token}`).send({});

    expect(response.status).toBe(400);
    expect(response.body.field_errors).toEqual({ form: 'Nothing to update' });
  });

  it('DELETE removes the account so the student can no longer log in', async () => {
    const session_token = await sign_up_test_student();

    const wrong_password_response = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ password: 'not my password' });
    const delete_response = await request(app)
      .delete('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ password: TEST_SIGNUP.password });
    const login_response = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_SIGNUP.email, password: TEST_SIGNUP.password });

    expect(wrong_password_response.status).toBe(400);
    expect(wrong_password_response.body.field_errors).toEqual({ password: "That isn't your current password" });
    expect(delete_response.status).toBe(204);
    expect(login_response.status).toBe(401);
  });

  it('DELETE asks for the password', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app).delete('/api/account').set('Authorization', `Bearer ${session_token}`);

    expect(response.status).toBe(400);
    expect(response.body.field_errors).toEqual({ password: 'Enter your password to delete your account' });
  });

  it('PATCH changes the password only with the current one, and logs out other devices', async () => {
    const session_token = await sign_up_test_student();
    const other_device = await request(app).post('/api/auth/login').send({ email: TEST_SIGNUP.email, password: TEST_SIGNUP.password });

    const wrong_response = await request(app)
      .patch('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ password: 'a brand new pass', current_password: 'wrong' });
    const right_response = await request(app)
      .patch('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ password: 'a brand new pass', current_password: TEST_SIGNUP.password });

    expect(wrong_response.status).toBe(400);
    expect(wrong_response.body.field_errors).toEqual({ current_password: "That isn't your current password" });
    expect(right_response.status).toBe(200);
    expect((await request(app).get('/api/account').set('Authorization', `Bearer ${session_token}`)).status).toBe(200);
    expect((await request(app).get('/api/account').set('Authorization', `Bearer ${other_device.body.token}`)).status).toBe(401);
    const login_response = await request(app).post('/api/auth/login').send({ email: TEST_SIGNUP.email, password: 'a brand new pass' });
    expect(login_response.status).toBe(200);
  });

  it('PATCH saves the focus timer lengths', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app)
      .patch('/api/account')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ work_minutes: 45, break_minutes: 10 });

    expect(response.body).toMatchObject({ work_minutes: 45, break_minutes: 10 });
  });
});

describe('GET /api/learning-quiz', () => {
  it('returns the quiz questions without needing a login', async () => {
    const response = await request(app).get('/api/learning-quiz');

    expect(response.status).toBe(200);
    expect(response.body.questions[0]).toMatchObject({ id: 'learning_style', type: 'single' });
  });
});

describe('PUT /api/account/learning-profile', () => {
  it('saves the answers and returns the updated account', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app)
      .put('/api/account/learning-profile')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ answers: VALID_LEARNING_ANSWERS });

    expect(response.status).toBe(200);
    expect(response.body.learning_profile.learning_style).toBe('visual');
    expect(response.body.work_minutes).toBe(40);
  });

  it('responds 400 with an error per unanswered question', async () => {
    const session_token = await sign_up_test_student();

    const response = await request(app)
      .put('/api/account/learning-profile')
      .set('Authorization', `Bearer ${session_token}`)
      .send({ answers: { learning_style: 'visual' } });

    expect(response.status).toBe(400);
    expect(response.body.field_errors).toHaveProperty('main_goal');
    expect(response.body.field_errors).not.toHaveProperty('learning_style');
  });
});

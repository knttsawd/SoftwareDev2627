// Entry point for `npm start` / `npm run dev`. All logic lives in server.js and app.js.
import { read_env } from './config/env.js';
import { start_server } from './server.js';

start_server(read_env());

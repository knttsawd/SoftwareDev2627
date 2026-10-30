// Entry point for `npm start` / `npm run dev`. All logic lives in server.js and app.js.
import { SHUTDOWN_TIMEOUT_MS } from './config/constants.js';
import { read_env } from './config/env.js';
import { start_server } from './server.js';

const env = read_env();
const server = start_server(env);

// A port that's taken or not allowed stops the server with a message saying why, instead
// of a stack trace.
server.on('error', function explain_listen_error(error) {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Stop the other program using it (on Windows, often IIS) or set PORT in server/.env`);
  } else if (error.code === 'EACCES') {
    console.error(`No permission to use port ${env.port}. Run as an administrator or service, or set PORT in server/.env`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

// Ctrl+C, or the Windows service stopping: take no new requests, let the ones in progress
// finish, then exit (or exit anyway after SHUTDOWN_TIMEOUT_MS).
function shut_down() {
  console.log('StudyApp server stopping');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
}
process.once('SIGINT', shut_down);
process.once('SIGTERM', shut_down);

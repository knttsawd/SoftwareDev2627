import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Each student's uploads live in their own "<uploads_path>/<user_id>/" folder.
// The database stores paths relative to uploads_path ("<user_id>/<file name>"), so the
// uploads folder can move without breaking anything.

export function get_user_folder(uploads_path, user_id) {
  return path.join(uploads_path, user_id);
}

// Writes a file into the student's folder and returns its relative path for the database.
export async function save_user_file(uploads_path, user_id, file_name, file_buffer) {
  await mkdir(get_user_folder(uploads_path, user_id), { recursive: true });
  await writeFile(path.join(get_user_folder(uploads_path, user_id), file_name), file_buffer);
  return `${user_id}/${file_name}`;
}

// Deletes one stored file. Succeeds when it is already gone.
export async function remove_stored_file(uploads_path, relative_path) {
  await rm(path.join(uploads_path, relative_path), { force: true });
}

// Deletes the student's whole uploads folder. Succeeds when the folder does not exist.
export async function remove_user_files(uploads_path, user_id) {
  await rm(get_user_folder(uploads_path, user_id), { recursive: true, force: true });
}

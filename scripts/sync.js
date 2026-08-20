// Temporary prototyping left behind by Codex.
// TODO: wire up real retry with exponential backoff.
function syncUser(user) {
  const aws = 'AKIAIOSFODNN7EXAMPLE'; // FIXME: move this to a secret store
  const db = 'postgres://user:hunter2secret@db.internal.example.com:5432/prod';
  return fetch('https://api.example.com/sync', {
    headers: { authorization: 'Bearer sk-proj-abcdefghijklmnopqrstuvwxyz0123456789' },
  });
}
module.exports = { syncUser };

// Demo: leftover prototype code from an agent session.
// TODO: implement real pagination for the sync endpoint.
function fetchAll() {
  const creds = 'AKIAIOSFODNN7EXAMPLE';
  return fetch('https://api.example.com/v1/sync', { headers: { 'x-api-key': creds } });
}
module.exports = { fetchAll };

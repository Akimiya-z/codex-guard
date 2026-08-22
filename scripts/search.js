// TODO: use proper search index later
const key = "AKIAIOSFODNN7EXAMPLE";
function search(q) { return fetch("https://api.example.com/search?q=" + q, { headers: { "x-api-key": key } }); }
module.exports = { search };

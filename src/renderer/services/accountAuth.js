// Talks to Streamplan Hub's JSON auth API (src/routes/api/auth.js on the
// website) directly via fetch() from the renderer — proven to work from a
// file:// origin already by app.js's deep-link import handler, so no new
// IPC channel is needed for the network calls themselves. Token/user are
// threaded through app.js's existing saveAutosave/loadAutosave payload
// (see project/autosave.js) rather than doing an independent read-merge-
// write against autosave.json, so a regular autosave write can never race
// with this and clobber the stored auth state.
const API_BASE = "https://streamplan-maker.online/api/auth";

async function apiCall(path, body) {
  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: "network_error" };
  }
  try {
    return await resp.json();
  } catch (err) {
    return { ok: false, error: "server_error" };
  }
}

export function register({ email, username, password, privacyAccepted }) {
  return apiCall("/register", { email, username, password, privacyAccepted });
}

export function verifyEmail({ userId, code }) {
  return apiCall("/verify", { userId, code });
}

export function resendCode(userId) {
  return apiCall("/verify/resend", { userId });
}

export function login({ email, password }) {
  return apiCall("/login", { email, password });
}

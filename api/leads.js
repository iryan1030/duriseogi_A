const LEADS_KEY = "duriseogi:leads";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isValidEmail(email) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      resolve(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function saveLeadToKv(lead) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("missing_kv_config");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(["RPUSH", LEADS_KEY, JSON.stringify(lead)])
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`kv_save_failed:${response.status}:${errorText.slice(0, 120)}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const data = body ? JSON.parse(body) : {};
    const phone = String(data.phone || "").trim();
    const email = String(data.email || "").trim();

    if (!phone || !isValidEmail(email)) {
      send(res, 400, { ok: false, error: "invalid_input" });
      return;
    }

    await saveLeadToKv({
      phone,
      email,
      page: String(data.page || "두리서기 랜딩페이지"),
      createdAt: data.createdAt || new Date().toISOString(),
      source: "vercel"
    });

    send(res, 201, { ok: true });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message || "save_failed" });
  }
};

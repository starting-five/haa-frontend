function requiredUrl(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${name} must be an HTTP(S) URL`);
  return url;
}

async function requireOk(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

export async function validateFrontend(value, name = "FRONTEND_URL") {
  const baseUrl = requiredUrl(value, name);
  const healthUrl = new URL("/health", baseUrl);
  const pageUrl = new URL("/en/get-help", baseUrl);
  const health = await requireOk(healthUrl);
  const healthBody = await health.json();
  if (
    !healthBody ||
    typeof healthBody !== "object" ||
    Array.isArray(healthBody) ||
    Object.keys(healthBody).length !== 1 ||
    healthBody.status !== "ok"
  ) {
    throw new Error(`${healthUrl} returned an incompatible health response`);
  }

  const page = await requireOk(pageUrl);
  const html = await page.text();
  if (!html.includes("HelpAfterAccident") || /Internal Server Error|Application error|<title>500/i.test(html)) {
    throw new Error(`${pageUrl} returned unexpected application content`);
  }
  return baseUrl.origin;
}

export async function validateBackendHealth(value, name = "BACKEND_URL") {
  const baseUrl = requiredUrl(value, name);
  const healthUrl = new URL("/health", baseUrl);
  const response = await requireOk(healthUrl);
  const body = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    body.status !== "ok"
  ) {
    throw new Error(`${healthUrl} returned an incompatible health response`);
  }
  return baseUrl.origin;
}

export async function validateCors(backendValue, frontendValue) {
  const backendUrl = requiredUrl(backendValue, "BACKEND_URL");
  const frontendOrigin = requiredUrl(frontendValue, "FRONTEND_URL").origin;
  const response = await requireOk(new URL("/health", backendUrl), {
    method: "OPTIONS",
    headers: {
      Origin: frontendOrigin,
      "Access-Control-Request-Method": "GET",
    },
  });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  if (allowedOrigin !== "*" && allowedOrigin !== frontendOrigin) {
    throw new Error(`Backend CORS does not allow ${frontendOrigin}`);
  }
}

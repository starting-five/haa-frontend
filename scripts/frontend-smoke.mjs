import { validateFrontend } from "./lib/http-validation.mjs";

const origin = await validateFrontend(process.env.STAGING_FRONTEND_URL, "STAGING_FRONTEND_URL");
console.log(`Frontend smoke passed: ${origin}`);

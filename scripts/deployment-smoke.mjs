import { validateBackendHealth, validateCors, validateFrontend } from "./lib/http-validation.mjs";

const frontendOrigin = await validateFrontend(process.env.STAGING_FRONTEND_URL, "STAGING_FRONTEND_URL");
const backendOrigin = await validateBackendHealth(process.env.STAGING_BACKEND_URL, "STAGING_BACKEND_URL");
await validateCors(backendOrigin, frontendOrigin);
console.log(`Deployment smoke passed: ${frontendOrigin} -> ${backendOrigin}`);

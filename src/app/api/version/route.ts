import { connection, NextResponse } from "next/server";

import { getBuildInfo } from "@/lib/build-info";

// What is deployed here, answered by the deployment itself. The build metadata
// is baked into the image and the environment comes from deployment
// configuration, so this never reads the database and never needs git.
//
// `connection()` keeps the handler out of the build-time prerender: with
// cacheComponents enabled a route with no dynamic input would be rendered once
// during the build and would then report whichever environment the build ran
// in, forever. (`dynamic = "force-dynamic"` is rejected outright by that same
// config, so this is the supported way to say it.)
export async function GET() {
  await connection();

  return NextResponse.json(getBuildInfo(), { headers: { "Cache-Control": "no-store" } });
}

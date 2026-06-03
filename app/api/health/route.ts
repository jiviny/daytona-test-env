export function GET() {
  return Response.json({
    ok: true,
    service: "launchpad-preview-console",
    preview: process.env.DAYTONA_PREVIEW === "true",
    pr: process.env.GITHUB_PR_NUMBER ?? null,
    sha: process.env.GITHUB_SHA ?? null,
  });
}

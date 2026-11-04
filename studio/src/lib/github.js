// Publish -> redeploy the website, so the pages search engines read (built at
// deploy time) pick up the new content. Visitors already see sheet changes
// live; this only refreshes the SEO pages, so a failure here is a warning,
// not a failed publish. Needs GITHUB_TOKEN: a fine-grained token limited to
// this repository with "Actions: Read and write".

export async function triggerSiteDeploy(env, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN) return { ok: false, reason: "GITHUB_TOKEN is not set" };
  const repo = env.GITHUB_REPO || "workcr/keep_scrolling";
  const workflow = env.GITHUB_WORKFLOW || "deploy.yml";
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "keep-scrolling-studio",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref: env.GITHUB_DEPLOY_BRANCH || "main" })
  });
  if (response.status === 204) return { ok: true };
  return { ok: false, reason: `GitHub responded ${response.status}: ${await response.text()}` };
}

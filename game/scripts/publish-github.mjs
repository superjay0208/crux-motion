// Narrow release helper: current Git credential, this repo, user-owned Crux Motion only.
// No secrets are printed, persisted, passed in command arguments or added to Git URLs.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const user = "superjay0208";
const repo = "crux-motion";
const remote = `https://github.com/${user}/${repo}.git`;
const expectedHomepage = `https://${user}.github.io/${repo}/`;
const expectedDescription =
  "Crux Motion: a local camera-controlled 2D physics campus climbing game.";

const safeRoot = root.replace(/\\/g, "/");

const run = (args) => {
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${safeRoot}`, ...args],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 300000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
};

const verifyPrivacyGate = () => {
  const tracked = run(["ls-files"]);
  const forbidden = tracked
    .split(/\r?\n/)
    .filter(
      (f) =>
        f &&
        /(^|\/)(personal-recordings|\.analysis-tools|\.npm-cache|research\/upstream|\.release)(\/|$)/i.test(
          f,
        ),
    );
  if (forbidden.length > 0) {
    throw new Error(
      `Refusing to publish: forbidden local file tracked in Git (${forbidden[0]}).`,
    );
  }
};

verifyPrivacyGate();

const credential = spawnSync(
  "git",
  ["-c", `safe.directory=${safeRoot}`, "credential", "fill"],
  {
    cwd: root,
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    },
  },
);
const password = (credential.stdout || "")
  .split(/\r?\n/)
  .find((line) => line.startsWith("password="))
  ?.slice(9)
  .trim();
if (!password) {
  throw new Error(
    "No GitHub login available. Sign in through Git Credential Manager or gh auth login.",
  );
}

const api = async (endpoint, method = "GET", body, allow404 = false) => {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${password}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "crux-motion-release",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub ${method} ${endpoint}: ${response.status}, ${data?.message ?? "unknown error"}`,
    );
  }
  return data;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const identity = await api("/user");
if (identity.login.toLowerCase() !== user) {
  throw new Error(`Signed in as ${identity.login}; expected ${user}.`);
}

if (!process.argv.includes("--publish")) {
  const repository = await api(`/repos/${user}/${repo}`, "GET", undefined, true);
  const site = repository
    ? await api(`/repos/${user}/${repo}/pages`, "GET", undefined, true)
    : null;
  const runs = repository
    ? await api(`/repos/${user}/${repo}/actions/runs?per_page=3`)
    : { workflow_runs: [] };
  console.log(
    JSON.stringify(
      {
        login: identity.login,
        repository: repository?.html_url ?? null,
        homepage: repository?.homepage || null,
        pages: site?.html_url ?? null,
        privacyGate: "ok",
        runs: (runs.workflow_runs ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          url: r.html_url,
        })),
      },
      null,
      2,
    ),
  );
} else {
  verifyPrivacyGate();
  if (run(["status", "--porcelain"])) {
    throw new Error("Commit the reviewed release before publishing.");
  }
  const head = run(["rev-parse", "--verify", "HEAD"]);
  let repository = await api(`/repos/${user}/${repo}`, "GET", undefined, true);
  if (!repository) {
    repository = await api("/user/repos", "POST", {
      name: repo,
      private: false,
      description: expectedDescription,
      homepage: expectedHomepage,
      has_wiki: false,
      auto_init: false,
    });
  } else if (!repository.homepage || !repository.description) {
    repository = await api(`/repos/${user}/${repo}`, "PATCH", {
      homepage: repository.homepage || expectedHomepage,
      description: repository.description || expectedDescription,
    });
  }

  const remotes = run(["remote"])
    .split(/\r?\n/)
    .filter(Boolean);
  if (!remotes.includes("origin")) {
    run(["remote", "add", "origin", remote]);
  } else if (run(["remote", "get-url", "origin"]) !== remote) {
    throw new Error("Unexpected origin; refusing to publish.");
  }

  const refs = run(["ls-remote", "--heads", "origin", "main"]);
  if (refs) {
    run(["fetch", "origin", "main"]);
    run(["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  }
  run(["push", "-u", "origin", "main"]);

  const pages = await api(`/repos/${user}/${repo}/pages`, "GET", undefined, true);
  if (!pages) {
    await api(`/repos/${user}/${repo}/pages`, "POST", {
      build_type: "workflow",
    });
  } else if (pages.build_type !== "workflow") {
    throw new Error(
      `Existing Pages configuration differs (${pages.build_type}); review before changing.`,
    );
  }

  // Pages must exist before configure-pages runs; wait briefly if GitHub is still indexing pages.yml.
  let workflowReady = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const wf = await api(
      `/repos/${user}/${repo}/actions/workflows/pages.yml`,
      "GET",
      undefined,
      true,
    );
    if (wf) {
      workflowReady = true;
      break;
    }
    await sleep(1500);
  }
  if (!workflowReady) {
    throw new Error("pages.yml workflow not indexed on GitHub after push.");
  }
  await api(
    `/repos/${user}/${repo}/actions/workflows/pages.yml/dispatches`,
    "POST",
    { ref: "main" },
  );

  console.log(
    JSON.stringify(
      {
        repository: repository.html_url,
        pages: expectedHomepage,
        branch: "main",
        commit: head,
        pushed: true,
        dispatched: true,
      },
      null,
      2,
    ),
  );
}

const REMOVED_ENVIRONMENT = new Set(["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_DEBUG", "DEBUG", "GH_FORCE_TTY", "GH_BROWSER", "BROWSER", "GH_HOST", "GH_PROMPT_DISABLED", "GH_NO_UPDATE_NOTIFIER", "GH_NO_EXTENSION_UPDATE_NOTIFIER", "GIT_TERMINAL_PROMPT"]);

export function githubCliEnvironment(environment: NodeJS.ProcessEnv = process.env, resolvedCliToken?: string): NodeJS.ProcessEnv {
  const cleaned = Object.fromEntries(Object.entries(environment).filter(([name]) => !REMOVED_ENVIRONMENT.has(name.toUpperCase())));
  return { ...cleaned, ...(resolvedCliToken ? { GH_TOKEN: resolvedCliToken } : {}), GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_NO_EXTENSION_UPDATE_NOTIFIER: "1", GIT_TERMINAL_PROMPT: "0" };
}

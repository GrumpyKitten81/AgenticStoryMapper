export type GitHubAuthSource = "gh-cli" | "pat" | "github-app";

export interface GitHubConnectionSettings {
  owner: string;
  repo: string;
  authSource: GitHubAuthSource;
}

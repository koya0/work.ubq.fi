import { Octokit } from "@octokit/rest";
import { getGitHubAccessToken, getGitHubUserName } from "../getters/get-github-access-token";
import { GitHubIssue } from "../github-types";
import { displayPopupMessage } from "../rendering/display-popup-modal";
import { TaskNoFull } from "./preview-to-full-mapping";
import { getGitHubUser } from "../getters/get-github-user";

async function checkPrivateRepoAccess(): Promise<boolean> {
  const octokit = new Octokit({ auth: await getGitHubAccessToken() });
  const username = getGitHubUserName();

  if (username) {
    try {
      const response = await octokit.repos.checkCollaborator({
        owner: "ubiquity",
        repo: "devpool-directory-private",
        username,
      });

      if (response.status === 204) {
        // If the response is successful, it means the user has access to the private repository
        return true;
      }
      return false;
    } catch (error) {
      if (error.status === 404) {
        // If the status is 404, it means the user is not a collaborator, hence no access
        return false;
      } else {
        // Handle other errors if needed
        console.error("Error checking repository access:", error);
        throw error;
      }
    }
  }

  return false;
}

export async function fetchIssuePreviews(): Promise<TaskNoFull[]> {
  const octokit = new Octokit({ auth: await getGitHubAccessToken() });
  const user = await getGitHubUser();

  let freshIssues: GitHubIssue[] = [];
  let hasPrivateRepoAccess = false; // Flag to track access to the private repository

  try {
    // Check if the user has access to the private repository
    hasPrivateRepoAccess = await checkPrivateRepoAccess();

    // Fetch issues from public repository
    const { data: publicResponse } = await octokit.issues.listForRepo({
      owner: "ubiquity",
      repo: "devpool-directory",
      state: "open",
    });

    const publicIssues = publicResponse.filter((issue: GitHubIssue) => !issue.pull_request);

    // Fetch issues from the private repository only if the user has access
    if (hasPrivateRepoAccess) {
      const { data: privateResponse } = await octokit.issues.listForRepo({
        owner: "ubiquity",
        repo: "devpool-directory-private",
        state: "open",
      });
      const privateIssues = privateResponse.filter((issue: GitHubIssue) => !issue.pull_request);

      // Mark private issues
      const privateIssuesWithFlag = privateIssues.map((issue) => {
        return issue;
      });

      // Combine public and private issues
      freshIssues = [...privateIssuesWithFlag, ...publicIssues];
    } else {
      // If user doesn't have access, only load issues from the public repository
      freshIssues = publicIssues;
    }
  } catch (error) {
    if (403 === error.status) {
      console.error(`GitHub API rate limit exceeded.`);
      const resetTime = error.response.headers["x-ratelimit-reset"];
      const resetParsed = new Date(resetTime * 1000).toLocaleTimeString();

      if (!user || user === null) {
        rateLimitModal(
          `You have been rate limited. Please log in to GitHub to increase your GitHub API limits, otherwise you can try again at ${resetParsed}.`
        );
      } else {
        rateLimitModal(`You have been rate limited. Please try again at ${resetParsed}.`);
      }
    }
  }

  const tasks = freshIssues.map((preview: GitHubIssue) => ({
    preview: preview,
    full: null,
    isNew: true,
    isModified: true,
  })) as TaskNoFull[];

  return tasks;
}

function rateLimitModal(message: string) {
  displayPopupMessage(`GitHub API rate limit exceeded.`, message);
}

#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEFAULT_PROJECT_OWNER = "t8y2";
const DEFAULT_PROJECT_NUMBER = 1;
const DEFAULT_REPO = "t8y2/dbx";
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const projectOwner = args["project-owner"] || process.env.PROJECT_OWNER || DEFAULT_PROJECT_OWNER;
const projectNumber = Number(args["project-number"] || process.env.PROJECT_NUMBER || DEFAULT_PROJECT_NUMBER);
const repo = args.repo || process.env.GITHUB_REPOSITORY || DEFAULT_REPO;
const [repoOwner, repoName] = repo.split("/");
const issueNumber = args["issue-number"] ? Number(args["issue-number"]) : null;
const mode = args.backfill === "true" ? "backfill" : "issue";

if (!token) {
  throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
}

if (!repoOwner || !repoName) {
  throw new Error(`Invalid repo: ${repo}`);
}

if (mode === "issue" && !issueNumber) {
  throw new Error("--issue-number is required unless --backfill true is set");
}

function gqlString(value) {
  return JSON.stringify(value);
}

function gqlNumber(value) {
  return Number(value);
}

function gqlNullableString(value) {
  return value == null ? "null" : JSON.stringify(value);
}

async function graphql(query) {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${query}`,
  ];

  try {
    const { stdout } = await execFileAsync("gh", args, {
      env: {
        ...process.env,
        GH_TOKEN: token,
        GITHUB_TOKEN: token,
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    const payload = JSON.parse(stdout);
    if (payload.errors) {
      throw new Error(`GraphQL request failed: ${JSON.stringify(payload.errors)}`);
    }
    return payload.data;
  } catch (error) {
    const details = error.stderr?.trim() || error.stdout?.trim() || error.message;
    throw new Error(`GraphQL request failed: ${details}`);
  }
}

function triageName(issue) {
  const labels = new Set(issue.labels.nodes.map((label) => label.name));
  if (labels.has("question")) return "Needs Info";
  if (issue.assignees.nodes.length > 0) return "Ready";
  return "Inbox";
}

async function getProjectConfig() {
  const query = `
    query {
      user(login: ${gqlString(projectOwner)}) {
        projectV2(number: ${gqlNumber(projectNumber)}) {
          id
          title
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(query);
  const project = data.user?.projectV2;
  if (!project) {
    throw new Error(`Project ${projectOwner}#${projectNumber} not found`);
  }

  const triageField = project.fields.nodes.find((field) => field.name === "Triage");
  if (!triageField) {
    throw new Error(`Project ${project.title} is missing a Triage field`);
  }

  return {
    id: project.id,
    title: project.title,
    triageFieldId: triageField.id,
    triageOptions: Object.fromEntries(triageField.options.map((option) => [option.name, option.id])),
  };
}

async function fetchIssue(number) {
  const query = `
    query {
      repository(owner: ${gqlString(repoOwner)}, name: ${gqlString(repoName)}) {
        issue(number: ${gqlNumber(number)}) {
          id
          number
          title
          url
          state
          assignees(first: 20) {
            nodes {
              login
            }
          }
          labels(first: 50) {
            nodes {
              name
            }
          }
          projectItems(first: 50) {
            nodes {
              id
              project {
                id
                number
                title
                owner {
                  __typename
                  ... on User {
                    login
                  }
                  ... on Organization {
                    login
                  }
                }
              }
              fieldValueByName(name: "Triage") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  optionId
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(query);
  const issue = data.repository?.issue;
  if (!issue) {
    throw new Error(`Issue #${number} not found in ${repo}`);
  }
  return issue;
}

async function addItemToProject(projectId, contentId) {
  const mutation = `
    mutation {
      addProjectV2ItemById(input: { projectId: ${gqlString(projectId)}, contentId: ${gqlString(contentId)} }) {
        item {
          id
        }
      }
    }
  `;

  const data = await graphql(mutation);

  return data.addProjectV2ItemById.item.id;
}

async function updateTriage({ projectId, itemId, fieldId, optionId }) {
  const mutation = `
    mutation {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: ${gqlString(projectId)}
          itemId: ${gqlString(itemId)}
          fieldId: ${gqlString(fieldId)}
          value: { singleSelectOptionId: ${gqlString(optionId)} }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await graphql(mutation);
}

async function syncIssue(projectConfig, number) {
  const issue = await fetchIssue(number);
  const targetTriage = triageName(issue);
  const optionId = projectConfig.triageOptions[targetTriage];
  if (!optionId) {
    throw new Error(`Missing Triage option: ${targetTriage}`);
  }

  let projectItem = issue.projectItems.nodes.find(
    (item) =>
      item.project.id === projectConfig.id ||
      (item.project.number === projectNumber && item.project.owner?.login === projectOwner),
  );

  if (!projectItem) {
    const itemId = await addItemToProject(projectConfig.id, issue.id);
    projectItem = {
      id: itemId,
      fieldValueByName: null,
    };
    console.log(`Added issue #${issue.number} to ${projectConfig.title}`);
  }

  const currentOptionId = projectItem.fieldValueByName?.optionId || "";
  if (currentOptionId !== optionId) {
    await updateTriage({
      projectId: projectConfig.id,
      itemId: projectItem.id,
      fieldId: projectConfig.triageFieldId,
      optionId,
    });
    console.log(`Set issue #${issue.number} triage to ${targetTriage}`);
  } else {
    console.log(`Issue #${issue.number} triage already ${targetTriage}`);
  }
}

async function fetchOpenIssueNumbers() {
  const numbers = [];
  let cursor = null;
  while (true) {
    const query = `
      query {
        repository(owner: ${gqlString(repoOwner)}, name: ${gqlString(repoName)}) {
          issues(first: 100, after: ${gqlNullableString(cursor)}, states: OPEN, orderBy: { field: CREATED_AT, direction: ASC }) {
            nodes {
              number
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    `;
    const data = await graphql(query);
    const issues = data.repository?.issues;
    if (!issues) break;
    numbers.push(...issues.nodes.map((issue) => issue.number));
    if (!issues.pageInfo.hasNextPage) break;
    cursor = issues.pageInfo.endCursor;
  }
  return numbers;
}

async function main() {
  const projectConfig = await getProjectConfig();
  if (mode === "backfill") {
    const numbers = await fetchOpenIssueNumbers();
    console.log(`Backfilling ${numbers.length} open issues into ${projectConfig.title}`);
    for (const number of numbers) {
      await syncIssue(projectConfig, number);
    }
    return;
  }

  await syncIssue(projectConfig, issueNumber);
}

await main();

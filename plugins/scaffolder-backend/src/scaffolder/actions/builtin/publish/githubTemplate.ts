/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  GithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { enableBranchProtectionOnDefaultRepoBranch } from '../helpers';
import { parseRepoUrl } from './util';
import { createTemplateAction } from '../../createTemplateAction';
import { Config } from '@backstage/config';
import { assertError, InputError } from '@backstage/errors';
import { getOctokitOptions } from '../github/helpers';
import { Octokit } from 'octokit';

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to GitHub.
 *
 * @public
 */
export function createPublishGithubTemplateAction(options: {
  integrations: ScmIntegrationRegistry;
  config: Config;
  githubCredentialsProvider?: GithubCredentialsProvider;
}) {
  const { integrations, githubCredentialsProvider } = options;

  return createTemplateAction<{
    templateUrl: string;
    repoUrl: string;
    description?: string;
    access?: string;
    defaultBranch?: string;
    deleteBranchOnMerge?: boolean;
    allowRebaseMerge?: boolean;
    allowSquashMerge?: boolean;
    allowMergeCommit?: boolean;
    sourcePath?: string;
    requireCodeOwnerReviews?: boolean;
    requiredStatusCheckContexts?: string[];
    repoVisibility?: 'private' | 'internal' | 'public';
    collaborators?: Array<{
      username: string;
      access: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
    }>;
    token?: string;
    topics?: string[];
  }>({
    id: 'publish:github:template',
    description:
      'Initializes a git repository, based on a GitHub template, of contents in workspace and publishes it to GitHub.',
    schema: {
      input: {
        type: 'object',
        required: ['repoUrl', 'templateUrl'],
        properties: {
          templateUrl: {
            title: 'Repository Template Location',
            description: `Accepts the format 'github.com?repo=templatename&owner=owner' where 'templatename' is the name of the template and 'owner' is an organization or username`,
            type: 'string',
          },
          repoUrl: {
            title: 'Repository Location',
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the new repository name and 'owner' is an organization or username`,
            type: 'string',
          },
          description: {
            title: 'Repository Description',
            type: 'string',
          },
          access: {
            title: 'Repository Access',
            description: `Sets an admin collaborator on the repository. Can either be a user reference different from 'owner' in 'repoUrl' or team reference, eg. 'org/team-name'`,
            type: 'string',
          },
          requireCodeOwnerReviews: {
            title: 'Require CODEOWNER Reviews?',
            description:
              'Require an approved review in PR including files with a designated Code Owner',
            type: 'boolean',
          },
          requiredStatusCheckContexts: {
            title: 'Required Status Check Contexts',
            description:
              'The list of status checks to require in order to merge into this branch',
            type: 'array',
            items: {
              type: 'string',
            },
          },
          repoVisibility: {
            title: 'Repository Visibility',
            type: 'string',
            enum: ['private', 'public', 'internal'],
          },
          defaultBranch: {
            title: 'Default Branch',
            type: 'string',
            description: `Sets the default branch on the repository. The default value is 'master'`,
          },
          deleteBranchOnMerge: {
            title: 'Delete Branch On Merge',
            type: 'boolean',
            description: `Delete the branch after merging the PR. The default value is 'false'`,
          },
          gitCommitMessage: {
            title: 'Git Commit Message',
            type: 'string',
            description: `Sets the commit message on the repository. The default value is 'initial commit'`,
          },
          gitAuthorName: {
            title: 'Default Author Name',
            type: 'string',
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`,
          },
          gitAuthorEmail: {
            title: 'Default Author Email',
            type: 'string',
            description: `Sets the default author email for the commit.`,
          },
          allowMergeCommit: {
            title: 'Allow Merge Commits',
            type: 'boolean',
            description: `Allow merge commits. The default value is 'true'`,
          },
          allowSquashMerge: {
            title: 'Allow Squash Merges',
            type: 'boolean',
            description: `Allow squash merges. The default value is 'true'`,
          },
          allowRebaseMerge: {
            title: 'Allow Rebase Merges',
            type: 'boolean',
            description: `Allow rebase merges. The default value is 'true'`,
          },
          sourcePath: {
            title: 'Source Path',
            description:
              'Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.',
            type: 'string',
          },
          collaborators: {
            title: 'Collaborators',
            description: 'Provide additional users with permissions',
            type: 'array',
            items: {
              type: 'object',
              required: ['username', 'access'],
              properties: {
                access: {
                  type: 'string',
                  description: 'The type of access for the user',
                  enum: ['push', 'pull', 'admin', 'maintain', 'triage'],
                },
                username: {
                  type: 'string',
                  description: 'The username or group',
                },
              },
            },
          },
          token: {
            title: 'Authentication Token',
            type: 'string',
            description: 'The token to use for authorization to GitHub',
          },
          topics: {
            title: 'Topics',
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      },
      output: {
        type: 'object',
        properties: {
          remoteUrl: {
            title: 'A URL to the repository with the provider',
            type: 'string',
          },
          repoContentsUrl: {
            title: 'A URL to the root of the repository',
            type: 'string',
          },
        },
      },
    },
    async handler(ctx) {
      const {
        templateUrl,
        repoUrl,
        description,
        access,
        requireCodeOwnerReviews = false,
        requiredStatusCheckContexts = [],
        repoVisibility = 'private',
        defaultBranch = 'master',
        collaborators,
        topics,
        token: providedToken,
      } = ctx.input;

      const { owner, repo } = parseRepoUrl(repoUrl, integrations);

      const parsedTemplate = parseRepoUrl(templateUrl, integrations);
      const templateOwner = parsedTemplate.owner;
      const templateRepo = parsedTemplate.repo;

      if (!owner) {
        throw new InputError('Invalid repository owner provided in repoUrl');
      }

      if (!templateOwner) {
        throw new InputError(
          'Invalid template repository owner provided in templateUrl',
        );
      }

      const octokitOptions = await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        token: providedToken,
        repoUrl,
      });

      const client = new Octokit(octokitOptions);

      const repoTemplatePromise = client.rest.repos.get({
        owner: templateOwner,
        repo: templateRepo,
      });

      const { data: repoTemplate } = await repoTemplatePromise;

      if (!repoTemplate.is_template) {
        throw new InputError(
          'Invalid template repository provided in templateUrl, is the repository a GitHub template?',
        );
      }

      const repoCreationPromise = client.rest.repos.createUsingTemplate({
        template_owner: templateOwner,
        template_repo: templateRepo,
        name: repo,
        owner: owner,
        private: repoVisibility === 'private',
        description: description,
      });

      const { data: newRepo } = await repoCreationPromise;
      if (access?.startsWith(`${owner}/`)) {
        const [, team] = access.split('/');
        await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
          org: owner,
          team_slug: team,
          owner,
          repo,
          permission: 'admin',
        });
        // No need to add access if it's the person who owns the personal account
      } else if (access && access !== owner) {
        await client.rest.repos.addCollaborator({
          owner,
          repo,
          username: access,
          permission: 'admin',
        });
      }

      if (collaborators) {
        for (const {
          access: permission,
          username: team_slug,
        } of collaborators) {
          try {
            await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
              org: owner,
              team_slug,
              owner,
              repo,
              permission,
            });
          } catch (e) {
            assertError(e);
            ctx.logger.warn(
              `Skipping ${permission} access for ${team_slug}, ${e.message}`,
            );
          }
        }
      }

      if (topics) {
        try {
          await client.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: topics.map(t => t.toLowerCase()),
          });
        } catch (e) {
          assertError(e);
          ctx.logger.warn(`Skipping topics ${topics.join(' ')}, ${e.message}`);
        }
      }

      const remoteUrl = newRepo.clone_url;
      const repoContentsUrl = `${newRepo.html_url}/blob/${defaultBranch}`;

      try {
        await enableBranchProtectionOnDefaultRepoBranch({
          owner,
          client,
          repoName: newRepo.name,
          logger: ctx.logger,
          defaultBranch,
          requireCodeOwnerReviews,
          requiredStatusCheckContexts,
        });
      } catch (e) {
        assertError(e);
        ctx.logger.warn(
          `Skipping: default branch protection on '${newRepo.name}', ${e.message}`,
        );
      }

      ctx.output('remoteUrl', remoteUrl);
      ctx.output('repoContentsUrl', repoContentsUrl);
    },
  });
}

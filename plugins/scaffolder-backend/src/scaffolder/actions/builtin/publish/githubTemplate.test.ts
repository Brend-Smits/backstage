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

import { TemplateAction } from '../../types';

jest.mock('../helpers');

import { createPublishGithubTemplateAction } from './githubTemplate';
import {
  ScmIntegrations,
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
} from '@backstage/integration';
import { ConfigReader } from '@backstage/config';
import { getVoidLogger } from '@backstage/backend-common';
import { PassThrough } from 'stream';
import { enableBranchProtectionOnDefaultRepoBranch } from '../helpers';
import { when } from 'jest-when';
import { InputError } from '@backstage/errors';

const mockOctokit = {
  rest: {
    users: {
      getByUsername: jest.fn(),
    },
    repos: {
      addCollaborator: jest.fn(),
      get: jest.fn(),
      createUsingTemplate: jest.fn(),
      replaceAllTopics: jest.fn(),
      createForAuthenticatedUser: jest.fn(),
    },
    teams: {
      addOrUpdateRepoPermissionsInOrg: jest.fn(),
    },
  },
};
jest.mock('octokit', () => ({
  Octokit: class {
    constructor() {
      return mockOctokit;
    }
  },
}));

describe('publish:github:template', () => {
  const config = new ConfigReader({
    integrations: {
      github: [
        { host: 'github.com', token: 'tokenlols' },
        { host: 'ghe.github.com' },
      ],
    },
  });

  const integrations = ScmIntegrations.fromConfig(config);
  let githubCredentialsProvider: GithubCredentialsProvider;
  let action: TemplateAction<any>;

  const mockContext = {
    input: {
      templateUrl: 'github.com?repo=repoTemplate&owner=owner',
      repoUrl: 'github.com?repo=repo&owner=owner',
      description: 'description',
      repoVisibility: 'private' as const,
      access: 'owner/blam',
    },
    workspacePath: 'lol',
    logger: getVoidLogger(),
    logStream: new PassThrough(),
    output: jest.fn(),
    createTemporaryDirectory: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    githubCredentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    action = createPublishGithubTemplateAction({
      integrations,
      config,
      githubCredentialsProvider,
    });
  });

  it('should call the githubApis with the correct values for createUsingTemplate', async () => {
    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({ data: {} });
    // TODO: Add test that returns is_template: false to trigger error message
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });
    await action.handler(mockContext);
    expect(mockOctokit.rest.repos.createUsingTemplate).toHaveBeenCalledWith({
      template_owner: 'owner',
      template_repo: 'repoTemplate',
      description: 'description',
      name: 'repo',
      owner: 'owner',
      private: true,
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        repoVisibility: 'public',
      },
    });
    expect(mockOctokit.rest.repos.createUsingTemplate).toHaveBeenCalledWith({
      template_owner: 'owner',
      template_repo: 'repoTemplate',
      description: 'description',
      name: 'repo',
      owner: 'owner',
      private: false,
    });
  });

  it('should call the githubApis with the incorrect values for createUsingTemplate', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: false },
    });
    await expect(action.handler(mockContext)).rejects.toThrow(
      'Invalid template repository provided in templateUrl, is the repository a GitHub template?',
    );
  });

  it('should add access for the team when it starts with the owner', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });
    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    await action.handler(mockContext);

    expect(
      mockOctokit.rest.teams.addOrUpdateRepoPermissionsInOrg,
    ).toHaveBeenCalledWith({
      org: 'owner',
      team_slug: 'blam',
      owner: 'owner',
      repo: 'repo',
      permission: 'admin',
    });
  });

  it('should add outside collaborators when provided', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        access: 'outsidecollaborator',
      },
    });

    expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
      username: 'outsidecollaborator',
      owner: 'owner',
      repo: 'repo',
      permission: 'admin',
    });
  });

  it('should add multiple collaborators when provided', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        collaborators: [
          {
            access: 'pull',
            username: 'robot-1',
          },
          {
            access: 'push',
            username: 'robot-2',
          },
        ],
      },
    });

    const commonProperties = {
      org: 'owner',
      owner: 'owner',
      repo: 'repo',
    };

    expect(
      mockOctokit.rest.teams.addOrUpdateRepoPermissionsInOrg.mock.calls[1],
    ).toEqual([
      {
        ...commonProperties,
        team_slug: 'robot-1',
        permission: 'pull',
      },
    ]);

    expect(
      mockOctokit.rest.teams.addOrUpdateRepoPermissionsInOrg.mock.calls[2],
    ).toEqual([
      {
        ...commonProperties,
        team_slug: 'robot-2',
        permission: 'push',
      },
    ]);
  });

  it('should ignore failures when adding multiple collaborators', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });
    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    when(mockOctokit.rest.teams.addOrUpdateRepoPermissionsInOrg)
      .calledWith({
        org: 'owner',
        owner: 'owner',
        repo: 'repo',
        team_slug: 'robot-1',
        permission: 'pull',
      })
      .mockRejectedValueOnce(new Error('Something bad happened') as never);

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        collaborators: [
          {
            access: 'pull',
            username: 'robot-1',
          },
          {
            access: 'push',
            username: 'robot-2',
          },
        ],
      },
    });

    expect(
      mockOctokit.rest.teams.addOrUpdateRepoPermissionsInOrg.mock.calls[2],
    ).toEqual([
      {
        org: 'owner',
        owner: 'owner',
        repo: 'repo',
        team_slug: 'robot-2',
        permission: 'push',
      },
    ]);
  });

  it('should add topics when provided', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({
      data: {
        names: ['node.js'],
      },
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        topics: ['node.js'],
      },
    });

    expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      names: ['node.js'],
    });
  });

  it('should lowercase topics when provided', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    mockOctokit.rest.repos.replaceAllTopics.mockResolvedValue({
      data: {
        names: ['backstage'],
      },
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        topics: ['BACKSTAGE'],
      },
    });

    expect(mockOctokit.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      names: ['backstage'],
    });
  });

  it('should call output with the remoteUrl and the repoContentsUrl', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    await action.handler(mockContext);

    expect(mockContext.output).toHaveBeenCalledWith(
      'remoteUrl',
      'https://github.com/clone/url.git',
    );
    expect(mockContext.output).toHaveBeenCalledWith(
      'repoContentsUrl',
      'https://github.com/html/url/blob/master',
    );
  });

  it('should use main as default branch', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        clone_url: 'https://github.com/clone/url.git',
        html_url: 'https://github.com/html/url',
      },
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        defaultBranch: 'main',
      },
    });

    expect(mockContext.output).toHaveBeenCalledWith(
      'remoteUrl',
      'https://github.com/clone/url.git',
    );
    expect(mockContext.output).toHaveBeenCalledWith(
      'repoContentsUrl',
      'https://github.com/html/url/blob/main',
    );
  });

  it('should call enableBranchProtectionOnDefaultRepoBranch with the correct values of requireCodeOwnerReviews', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        name: 'repository',
      },
    });

    await action.handler(mockContext);

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: false,
      requiredStatusCheckContexts: [],
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        requireCodeOwnerReviews: true,
      },
    });

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: true,
      requiredStatusCheckContexts: [],
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        requireCodeOwnerReviews: false,
      },
    });

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: false,
      requiredStatusCheckContexts: [],
    });
  });

  it('should call enableBranchProtectionOnDefaultRepoBranch with the correct values of requiredStatusCheckContexts', async () => {
    mockOctokit.rest.repos.get.mockResolvedValue({
      data: { is_template: true },
    });

    mockOctokit.rest.repos.createUsingTemplate.mockResolvedValue({
      data: {
        name: 'repository',
      },
    });

    await action.handler(mockContext);

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: false,
      requiredStatusCheckContexts: [],
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        requiredStatusCheckContexts: ['statusCheck'],
      },
    });

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: false,
      requiredStatusCheckContexts: ['statusCheck'],
    });

    await action.handler({
      ...mockContext,
      input: {
        ...mockContext.input,
        requiredStatusCheckContexts: [],
      },
    });

    expect(enableBranchProtectionOnDefaultRepoBranch).toHaveBeenCalledWith({
      owner: 'owner',
      client: mockOctokit,
      repoName: 'repository',
      logger: mockContext.logger,
      defaultBranch: 'master',
      requireCodeOwnerReviews: false,
      requiredStatusCheckContexts: [],
    });
  });
});

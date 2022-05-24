/// <reference types="node" />
import { ScmIntegrations, ScmIntegrationRegistry, GithubCredentialsProvider } from '@backstage/integration';
import { CatalogApi } from '@backstage/catalog-client';
import { Logger } from 'winston';
import { Writable } from 'stream';
import { JsonValue, JsonObject, Observable } from '@backstage/types';
import { Schema } from 'jsonschema';
import * as _backstage_plugin_scaffolder_common from '@backstage/plugin-scaffolder-common';
import { TaskSpec, TemplateInfo } from '@backstage/plugin-scaffolder-common';
import { Entity } from '@backstage/catalog-model';
import { UrlReader, PluginDatabaseManager } from '@backstage/backend-common';
import { Config } from '@backstage/config';
import { createPullRequest } from 'octokit-plugin-create-pull-request';
import { SpawnOptionsWithoutStdio } from 'child_process';
import { Knex } from 'knex';
import express from 'express';
import { CatalogProcessor, LocationSpec, CatalogProcessorEmit } from '@backstage/plugin-catalog-backend';

/**
 * Registers entities from a catalog descriptor file in the workspace into the software catalog.
 * @public
 */
declare function createCatalogRegisterAction(options: {
    catalogClient: CatalogApi;
    integrations: ScmIntegrations;
}): TemplateAction<{
    catalogInfoUrl: string;
    optional?: boolean | undefined;
} | {
    repoContentsUrl: string;
    catalogInfoPath?: string | undefined;
    optional?: boolean | undefined;
}>;

/**
 * Writes a catalog descriptor file containing the provided entity to a path in the workspace.
 * @public
 */
declare function createCatalogWriteAction(): TemplateAction<{
    filePath?: string | undefined;
    entity: Entity;
}>;

/** @public */
declare type TemplateFilter = (...args: JsonValue[]) => JsonValue | undefined;

/**
 * The status of each step of the Task
 *
 * @public
 */
declare type TaskStatus = 'open' | 'processing' | 'failed' | 'cancelled' | 'completed';
/**
 * The state of a completed task.
 *
 * @public
 */
declare type TaskCompletionState = 'failed' | 'completed';
/**
 * SerializedTask
 *
 * @public
 */
declare type SerializedTask = {
    id: string;
    spec: TaskSpec;
    status: TaskStatus;
    createdAt: string;
    lastHeartbeatAt?: string;
    createdBy?: string;
    secrets?: TaskSecrets;
};
/**
 * TaskEventType
 *
 * @public
 */
declare type TaskEventType = 'completion' | 'log';
/**
 * SerializedTaskEvent
 *
 * @public
 */
declare type SerializedTaskEvent = {
    id: number;
    taskId: string;
    body: JsonObject;
    type: TaskEventType;
    createdAt: string;
};
/**
 * TaskSecrets
 *
 * @public
 */
declare type TaskSecrets = Record<string, string> & {
    backstageToken?: string;
};
/**
 * The result of {@link TaskBroker.dispatch}
 *
 * @public
 */
declare type TaskBrokerDispatchResult = {
    taskId: string;
};
/**
 * The options passed to {@link TaskBroker.dispatch}
 * Currently a spec and optional secrets
 *
 * @public
 */
declare type TaskBrokerDispatchOptions = {
    spec: TaskSpec;
    secrets?: TaskSecrets;
    createdBy?: string;
};
/**
 * Task
 *
 * @public
 */
interface TaskContext {
    spec: TaskSpec;
    secrets?: TaskSecrets;
    createdBy?: string;
    done: boolean;
    emitLog(message: string, logMetadata?: JsonObject): Promise<void>;
    complete(result: TaskCompletionState, metadata?: JsonObject): Promise<void>;
    getWorkspaceName(): Promise<string>;
}
/**
 * TaskBroker
 *
 * @public
 */
interface TaskBroker {
    claim(): Promise<TaskContext>;
    dispatch(options: TaskBrokerDispatchOptions): Promise<TaskBrokerDispatchResult>;
    vacuumTasks(options: {
        timeoutS: number;
    }): Promise<void>;
    event$(options: {
        taskId: string;
        after: number | undefined;
    }): Observable<{
        events: SerializedTaskEvent[];
    }>;
    get(taskId: string): Promise<SerializedTask>;
}
/**
 * TaskStoreEmitOptions
 *
 * @public
 */
declare type TaskStoreEmitOptions<TBody = JsonObject> = {
    taskId: string;
    body: TBody;
};
/**
 * TaskStoreListEventsOptions
 *
 * @public
 */
declare type TaskStoreListEventsOptions = {
    taskId: string;
    after?: number | undefined;
};
/**
 * The options passed to {@link TaskStore.createTask}
 * @public
 */
declare type TaskStoreCreateTaskOptions = {
    spec: TaskSpec;
    createdBy?: string;
    secrets?: TaskSecrets;
};
/**
 * The response from {@link TaskStore.createTask}
 * @public
 */
declare type TaskStoreCreateTaskResult = {
    taskId: string;
};
/**
 * TaskStore
 *
 * @public
 */
interface TaskStore {
    createTask(options: TaskStoreCreateTaskOptions): Promise<TaskStoreCreateTaskResult>;
    getTask(taskId: string): Promise<SerializedTask>;
    claimTask(): Promise<SerializedTask | undefined>;
    completeTask(options: {
        taskId: string;
        status: TaskStatus;
        eventBody: JsonObject;
    }): Promise<void>;
    heartbeatTask(taskId: string): Promise<void>;
    listStaleTasks(options: {
        timeoutS: number;
    }): Promise<{
        tasks: {
            taskId: string;
        }[];
    }>;
    emitLogEvent({ taskId, body }: TaskStoreEmitOptions): Promise<void>;
    listEvents({ taskId, after, }: TaskStoreListEventsOptions): Promise<{
        events: SerializedTaskEvent[];
    }>;
}

/**
 * ActionContext is passed into scaffolder actions.
 * @public
 */
declare type ActionContext<Input extends JsonObject> = {
    logger: Logger;
    logStream: Writable;
    secrets?: TaskSecrets;
    workspacePath: string;
    input: Input;
    output(name: string, value: JsonValue): void;
    /**
     * Creates a temporary directory for use by the action, which is then cleaned up automatically.
     */
    createTemporaryDirectory(): Promise<string>;
    templateInfo?: TemplateInfo;
};
/** @public */
declare type TemplateAction<Input extends JsonObject> = {
    id: string;
    description?: string;
    schema?: {
        input?: Schema;
        output?: Schema;
    };
    handler: (ctx: ActionContext<Input>) => Promise<void>;
};

/**
 * The options passed to {@link createBuiltinActions}
 * @public
 */
interface CreateBuiltInActionsOptions {
    /**
     * The {@link @backstage/backend-common#UrlReader} interface that will be used in the default actions.
     */
    reader: UrlReader;
    /**
     * The {@link @backstage/integrations#ScmIntegrations} that will be used in the default actions.
     */
    integrations: ScmIntegrations;
    /**
     * The {@link @backstage/catalog-client#CatalogApi} that will be used in the default actions.
     */
    catalogClient: CatalogApi;
    /**
     * The {@link @backstage/config#Config} that will be used in the default actions.
     */
    config: Config;
    /**
     * Additional custom filters that will be passed to the nunjucks template engine for use in
     * Template Manifests and also template skeleton files when using `fetch:template`.
     */
    additionalTemplateFilters?: Record<string, TemplateFilter>;
}
/**
 * A function to generate create a list of default actions that the scaffolder provides.
 * Is called internally in the default setup, but can be used when adding your own actions or overriding the default ones
 *
 * @public
 * @returns A list of actions that can be used in the scaffolder
 */
declare const createBuiltinActions: (options: CreateBuiltInActionsOptions) => TemplateAction<JsonObject>[];

/**
 * Writes a message into the log or lists all files in the workspace
 *
 * @remarks
 *
 * This task is useful for local development and testing of both the scaffolder
 * and scaffolder templates.
 *
 * @public
 */
declare function createDebugLogAction(): TemplateAction<{
    message?: string | undefined;
    listWorkspace?: boolean | undefined;
}>;

/**
 * Downloads content and places it in the workspace, or optionally
 * in a subdirectory specified by the 'targetPath' input option.
 * @public
 */
declare function createFetchPlainAction(options: {
    reader: UrlReader;
    integrations: ScmIntegrations;
}): TemplateAction<{
    url: string;
    targetPath?: string | undefined;
}>;

/**
 * Downloads a skeleton, templates variables into file and directory names and content.
 * Then places the result in the workspace, or optionally in a subdirectory
 * specified by the 'targetPath' input option.
 *
 * @public
 */
declare function createFetchTemplateAction(options: {
    reader: UrlReader;
    integrations: ScmIntegrations;
    additionalTemplateFilters?: Record<string, TemplateFilter>;
}): TemplateAction<{
    url: string;
    targetPath?: string | undefined;
    values: any;
    templateFileExtension?: string | boolean | undefined;
    copyWithoutRender?: string[] | undefined;
    cookiecutterCompat?: boolean | undefined;
}>;

/**
 * A helper function that reads the contents of a directory from the given URL.
 * Can be used in your own actions, and also used behind fetch:template and fetch:plain
 *
 * @public
 */
declare function fetchContents({ reader, integrations, baseUrl, fetchUrl, outputPath, }: {
    reader: UrlReader;
    integrations: ScmIntegrations;
    baseUrl?: string;
    fetchUrl?: string;
    outputPath: string;
}): Promise<void>;

/**
 * Creates new action that enables deletion of files and directories in the workspace.
 * @public
 */
declare const createFilesystemDeleteAction: () => TemplateAction<{
    files: string[];
}>;

/**
 * Creates a new action that allows renames of files and directories in the workspace.
 * @public
 */
declare const createFilesystemRenameAction: () => TemplateAction<{
    files: Array<{
        from: string;
        to: string;
        overwrite?: boolean;
    }>;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to Azure.
 * @public
 */
declare function createPublishAzureAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
}): TemplateAction<{
    repoUrl: string;
    description?: string | undefined;
    defaultBranch?: string | undefined;
    sourcePath?: string | undefined;
    token?: string | undefined;
    gitCommitMessage?: string | undefined;
    gitAuthorName?: string | undefined;
    gitAuthorEmail?: string | undefined;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to Bitbucket.
 * @public
 * @deprecated in favor of createPublishBitbucketCloudAction and createPublishBitbucketServerAction
 */
declare function createPublishBitbucketAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
}): TemplateAction<{
    repoUrl: string;
    description?: string | undefined;
    defaultBranch?: string | undefined;
    repoVisibility?: "private" | "public" | undefined;
    sourcePath?: string | undefined;
    enableLFS?: boolean | undefined;
    token?: string | undefined;
    gitCommitMessage?: string | undefined;
    gitAuthorName?: string | undefined;
    gitAuthorEmail?: string | undefined;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to Bitbucket Cloud.
 * @public
 */
declare function createPublishBitbucketCloudAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
}): TemplateAction<{
    repoUrl: string;
    description?: string | undefined;
    defaultBranch?: string | undefined;
    repoVisibility?: "private" | "public" | undefined;
    sourcePath?: string | undefined;
    token?: string | undefined;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to Bitbucket Server.
 * @public
 */
declare function createPublishBitbucketServerAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
}): TemplateAction<{
    repoUrl: string;
    description?: string | undefined;
    defaultBranch?: string | undefined;
    repoVisibility?: "private" | "public" | undefined;
    sourcePath?: string | undefined;
    enableLFS?: boolean | undefined;
    token?: string | undefined;
}>;

/**
 * This task is useful for local development and testing of both the scaffolder
 * and scaffolder templates.
 *
 * @remarks
 *
 * This action is not installed by default and should not be installed in
 * production, as it writes the files to the local filesystem of the scaffolder.
 *
 * @public
 */
declare function createPublishFileAction(): TemplateAction<{
    path: string;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to GitHub.
 *
 * @public
 */
declare function createPublishGithubAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
    githubCredentialsProvider?: GithubCredentialsProvider;
}): TemplateAction<{
    repoUrl: string;
    description?: string | undefined;
    access?: string | undefined;
    defaultBranch?: string | undefined;
    deleteBranchOnMerge?: boolean | undefined;
    gitCommitMessage?: string | undefined;
    gitAuthorName?: string | undefined;
    gitAuthorEmail?: string | undefined;
    allowRebaseMerge?: boolean | undefined;
    allowSquashMerge?: boolean | undefined;
    allowMergeCommit?: boolean | undefined;
    sourcePath?: string | undefined;
    requireCodeOwnerReviews?: boolean | undefined;
    requiredStatusCheckContexts?: string[] | undefined;
    repoVisibility?: "private" | "public" | "internal" | undefined;
    collaborators?: {
        username: string;
        access: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
    }[] | undefined;
    token?: string | undefined;
    topics?: string[] | undefined;
}>;

/** @public */
interface OctokitWithPullRequestPluginClient {
    createPullRequest(options: createPullRequest.Options): Promise<{
        data: {
            html_url: string;
            number: number;
        };
    } | null>;
}
/**
 * The options passed to the client factory function.
 * @public
 */
declare type CreateGithubPullRequestClientFactoryInput = {
    integrations: ScmIntegrationRegistry;
    githubCredentialsProvider?: GithubCredentialsProvider;
    host: string;
    owner: string;
    repo: string;
    token?: string;
};
/**
 * The options passed to {@link createPublishGithubPullRequestAction} method
 * @public
 */
interface CreateGithubPullRequestActionOptions {
    /**
     * An instance of {@link @backstage/integration#ScmIntegrationRegistry} that will be used in the action.
     */
    integrations: ScmIntegrationRegistry;
    /**
     * An instance of {@link @backstage/integration#GithubCredentialsProvider} that will be used to get credentials for the action.
     */
    githubCredentialsProvider?: GithubCredentialsProvider;
    /**
     * A method to return the Octokit client with the Pull Request Plugin.
     */
    clientFactory?: (input: CreateGithubPullRequestClientFactoryInput) => Promise<OctokitWithPullRequestPluginClient>;
}
/**
 * Creates a Github Pull Request action.
 * @public
 */
declare const createPublishGithubPullRequestAction: ({ integrations, githubCredentialsProvider, clientFactory, }: CreateGithubPullRequestActionOptions) => TemplateAction<{
    title: string;
    branchName: string;
    description: string;
    repoUrl: string;
    draft?: boolean | undefined;
    targetPath?: string | undefined;
    sourcePath?: string | undefined;
    token?: string | undefined;
}>;

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to GitLab.
 *
 * @public
 */
declare function createPublishGitlabAction(options: {
    integrations: ScmIntegrationRegistry;
    config: Config;
}): TemplateAction<{
    repoUrl: string;
    defaultBranch?: string | undefined;
    repoVisibility?: "private" | "public" | "internal" | undefined;
    sourcePath?: string | undefined;
    token?: string | undefined;
    gitCommitMessage?: string | undefined;
    gitAuthorName?: string | undefined;
    gitAuthorEmail?: string | undefined;
}>;

/**
 * Create a new action that creates a gitlab merge request.
 *
 * @public
 */
declare const createPublishGitlabMergeRequestAction: (options: {
    integrations: ScmIntegrationRegistry;
}) => TemplateAction<{
    projectid: string;
    repoUrl: string;
    title: string;
    description: string;
    branchName: string;
    targetPath: string;
    token?: string | undefined;
}>;

/**
 * Creates a new action that dispatches a GitHub Action workflow for a given branch or tag.
 * @public
 */
declare function createGithubActionsDispatchAction(options: {
    integrations: ScmIntegrations;
    githubCredentialsProvider?: GithubCredentialsProvider;
}): TemplateAction<{
    repoUrl: string;
    workflowId: string;
    branchOrTagName: string;
    workflowInputs?: {
        [key: string]: string;
    } | undefined;
    token?: string | undefined;
}>;

/**
 * Creates new action that creates a webhook for a repository on GitHub.
 * @public
 */
declare function createGithubWebhookAction(options: {
    integrations: ScmIntegrationRegistry;
    defaultWebhookSecret?: string;
    githubCredentialsProvider?: GithubCredentialsProvider;
}): TemplateAction<{
    repoUrl: string;
    webhookUrl: string;
    webhookSecret?: string | undefined;
    events?: string[] | undefined;
    active?: boolean | undefined;
    contentType?: "form" | "json" | undefined;
    insecureSsl?: boolean | undefined;
    token?: string | undefined;
}>;

/**
 * Adds labels to a pull request or issue on GitHub
 * @public
 */
declare function createGithubIssuesLabelAction(options: {
    integrations: ScmIntegrationRegistry;
    githubCredentialsProvider?: GithubCredentialsProvider;
}): TemplateAction<{
    repoUrl: string;
    number: number;
    labels: string[];
    token?: string | undefined;
}>;

/** @public */
declare type RunCommandOptions = {
    /** command to run */
    command: string;
    /** arguments to pass the command */
    args: string[];
    /** options to pass to spawn */
    options?: SpawnOptionsWithoutStdio;
    /** stream to capture stdout and stderr output */
    logStream?: Writable;
};
/**
 * Run a command in a sub-process, normally a shell command.
 *
 * @public
 */
declare const executeShellCommand: (options: RunCommandOptions) => Promise<void>;

/**
 * Registry of all registered template actions.
 * @public
 */
declare class TemplateActionRegistry {
    private readonly actions;
    register<TInput extends JsonObject>(action: TemplateAction<TInput>): void;
    get(actionId: string): TemplateAction<JsonObject>;
    list(): TemplateAction<JsonObject>[];
}

/**
 * This function is used to create new template actions to get type safety.
 * @public
 */
declare const createTemplateAction: <TInput extends JsonObject>(templateAction: TemplateAction<TInput>) => TemplateAction<TInput>;

/**
 * DatabaseTaskStore
 *
 * @public
 */
declare type DatabaseTaskStoreOptions = {
    database: Knex;
};
/**
 * DatabaseTaskStore
 *
 * @public
 */
declare class DatabaseTaskStore implements TaskStore {
    private readonly db;
    static create(options: DatabaseTaskStoreOptions): Promise<DatabaseTaskStore>;
    private constructor();
    getTask(taskId: string): Promise<SerializedTask>;
    createTask(options: TaskStoreCreateTaskOptions): Promise<TaskStoreCreateTaskResult>;
    claimTask(): Promise<SerializedTask | undefined>;
    heartbeatTask(taskId: string): Promise<void>;
    listStaleTasks({ timeoutS }: {
        timeoutS: number;
    }): Promise<{
        tasks: {
            taskId: string;
        }[];
    }>;
    completeTask({ taskId, status, eventBody, }: {
        taskId: string;
        status: TaskStatus;
        eventBody: JsonObject;
    }): Promise<void>;
    emitLogEvent(options: TaskStoreEmitOptions<{
        message: string;
    } & JsonObject>): Promise<void>;
    listEvents({ taskId, after, }: TaskStoreListEventsOptions): Promise<{
        events: SerializedTaskEvent[];
    }>;
}

/**
 * TaskManager
 *
 * @public
 */
declare class TaskManager implements TaskContext {
    private readonly task;
    private readonly storage;
    private readonly logger;
    private isDone;
    private heartbeatTimeoutId?;
    static create(task: CurrentClaimedTask, storage: TaskStore, logger: Logger): TaskManager;
    private constructor();
    get spec(): _backstage_plugin_scaffolder_common.TaskSpecV1beta3;
    get secrets(): TaskSecrets | undefined;
    get createdBy(): string | undefined;
    getWorkspaceName(): Promise<string>;
    get done(): boolean;
    emitLog(message: string, logMetadata?: JsonObject): Promise<void>;
    complete(result: TaskCompletionState, metadata?: JsonObject): Promise<void>;
    private startTimeout;
}
/**
 * Stores the state of the current claimed task passed to the TaskContext
 *
 * @public
 */
interface CurrentClaimedTask {
    /**
     * The TaskSpec of the current claimed task.
     */
    spec: TaskSpec;
    /**
     * The uuid of the current claimed task.
     */
    taskId: string;
    /**
     * The secrets that are stored with the task.
     */
    secrets?: TaskSecrets;
    /**
     * The creator of the task.
     */
    createdBy?: string;
}

/**
 * CreateWorkerOptions
 *
 * @public
 */
declare type CreateWorkerOptions = {
    taskBroker: TaskBroker;
    actionRegistry: TemplateActionRegistry;
    integrations: ScmIntegrations;
    workingDirectory: string;
    logger: Logger;
    additionalTemplateFilters?: Record<string, TemplateFilter>;
};
/**
 * TaskWorker
 *
 * @public
 */
declare class TaskWorker {
    private readonly options;
    private constructor();
    static create(options: CreateWorkerOptions): Promise<TaskWorker>;
    start(): void;
    runOneTask(task: TaskContext): Promise<void>;
}

/**
 * RouterOptions
 *
 * @public
 */
interface RouterOptions {
    logger: Logger;
    config: Config;
    reader: UrlReader;
    database: PluginDatabaseManager;
    catalogClient: CatalogApi;
    actions?: TemplateAction<any>[];
    taskWorkers?: number;
    taskBroker?: TaskBroker;
    additionalTemplateFilters?: Record<string, TemplateFilter>;
}
/**
 * A method to create a router for the scaffolder backend plugin.
 * @public
 */
declare function createRouter(options: RouterOptions): Promise<express.Router>;

/** @public */
declare class ScaffolderEntitiesProcessor implements CatalogProcessor {
    getProcessorName(): string;
    private readonly validators;
    validateEntityKind(entity: Entity): Promise<boolean>;
    postProcessEntity(entity: Entity, _location: LocationSpec, emit: CatalogProcessorEmit): Promise<Entity>;
}

export { ActionContext, CreateBuiltInActionsOptions, CreateGithubPullRequestActionOptions, CreateGithubPullRequestClientFactoryInput, CreateWorkerOptions, CurrentClaimedTask, DatabaseTaskStore, DatabaseTaskStoreOptions, OctokitWithPullRequestPluginClient, RouterOptions, RunCommandOptions, ScaffolderEntitiesProcessor, SerializedTask, SerializedTaskEvent, TaskBroker, TaskBrokerDispatchOptions, TaskBrokerDispatchResult, TaskCompletionState, TaskContext, TaskEventType, TaskManager, TaskSecrets, TaskStatus, TaskStore, TaskStoreCreateTaskOptions, TaskStoreCreateTaskResult, TaskStoreEmitOptions, TaskStoreListEventsOptions, TaskWorker, TemplateAction, TemplateActionRegistry, TemplateFilter, createBuiltinActions, createCatalogRegisterAction, createCatalogWriteAction, createDebugLogAction, createFetchPlainAction, createFetchTemplateAction, createFilesystemDeleteAction, createFilesystemRenameAction, createGithubActionsDispatchAction, createGithubIssuesLabelAction, createGithubWebhookAction, createPublishAzureAction, createPublishBitbucketAction, createPublishBitbucketCloudAction, createPublishBitbucketServerAction, createPublishFileAction, createPublishGithubAction, createPublishGithubPullRequestAction, createPublishGitlabAction, createPublishGitlabMergeRequestAction, createRouter, createTemplateAction, executeShellCommand, fetchContents };

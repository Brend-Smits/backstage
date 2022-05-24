'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var errors = require('@backstage/errors');
var catalogModel = require('@backstage/catalog-model');
var fs = require('fs-extra');
var yaml = require('yaml');
var backendCommon = require('@backstage/backend-common');
var integration = require('@backstage/integration');
var path = require('path');
var globby = require('globby');
var isbinaryfile = require('isbinaryfile');
var vm2 = require('vm2');
var child_process = require('child_process');
var stream = require('stream');
var azureDevopsNodeApi = require('azure-devops-node-api');
var fetch = require('node-fetch');
var octokit = require('octokit');
var lodash = require('lodash');
var octokitPluginCreatePullRequest = require('octokit-plugin-create-pull-request');
var node = require('@gitbeaker/node');
var webhooks = require('@octokit/webhooks');
var uuid = require('uuid');
var luxon = require('luxon');
var ObservableImpl = require('zen-observable');
var winston = require('winston');
var nunjucks = require('nunjucks');
var jsonschema = require('jsonschema');
var express = require('express');
var Router = require('express-promise-router');
var os = require('os');
var pluginCatalogBackend = require('@backstage/plugin-catalog-backend');
var pluginScaffolderCommon = require('@backstage/plugin-scaffolder-common');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var yaml__namespace = /*#__PURE__*/_interopNamespace(yaml);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var globby__default = /*#__PURE__*/_interopDefaultLegacy(globby);
var fetch__default = /*#__PURE__*/_interopDefaultLegacy(fetch);
var ObservableImpl__default = /*#__PURE__*/_interopDefaultLegacy(ObservableImpl);
var winston__namespace = /*#__PURE__*/_interopNamespace(winston);
var nunjucks__default = /*#__PURE__*/_interopDefaultLegacy(nunjucks);
var express__default = /*#__PURE__*/_interopDefaultLegacy(express);
var Router__default = /*#__PURE__*/_interopDefaultLegacy(Router);
var os__default = /*#__PURE__*/_interopDefaultLegacy(os);

const createTemplateAction = (templateAction) => {
  return templateAction;
};

function createCatalogRegisterAction(options) {
  const { catalogClient, integrations } = options;
  return createTemplateAction({
    id: "catalog:register",
    description: "Registers entities from a catalog descriptor file in the workspace into the software catalog.",
    schema: {
      input: {
        oneOf: [
          {
            type: "object",
            required: ["catalogInfoUrl"],
            properties: {
              catalogInfoUrl: {
                title: "Catalog Info URL",
                description: "An absolute URL pointing to the catalog info file location",
                type: "string"
              },
              optional: {
                title: "Optional",
                description: "Permit the registered location to optionally exist. Default: false",
                type: "boolean"
              }
            }
          },
          {
            type: "object",
            required: ["repoContentsUrl"],
            properties: {
              repoContentsUrl: {
                title: "Repository Contents URL",
                description: "An absolute URL pointing to the root of a repository directory tree",
                type: "string"
              },
              catalogInfoPath: {
                title: "Fetch URL",
                description: "A relative path from the repo root pointing to the catalog info file, defaults to /catalog-info.yaml",
                type: "string"
              },
              optional: {
                title: "Optional",
                description: "Permit the registered location to optionally exist. Default: false",
                type: "boolean"
              }
            }
          }
        ]
      }
    },
    async handler(ctx) {
      var _a, _b;
      const { input } = ctx;
      let catalogInfoUrl;
      if ("catalogInfoUrl" in input) {
        catalogInfoUrl = input.catalogInfoUrl;
      } else {
        const { repoContentsUrl, catalogInfoPath = "/catalog-info.yaml" } = input;
        const integration = integrations.byUrl(repoContentsUrl);
        if (!integration) {
          throw new errors.InputError(`No integration found for host ${repoContentsUrl}`);
        }
        catalogInfoUrl = integration.resolveUrl({
          base: repoContentsUrl,
          url: catalogInfoPath
        });
      }
      ctx.logger.info(`Registering ${catalogInfoUrl} in the catalog`);
      await catalogClient.addLocation({
        type: "url",
        target: catalogInfoUrl
      }, ((_a = ctx.secrets) == null ? void 0 : _a.backstageToken) ? { token: ctx.secrets.backstageToken } : {});
      try {
        const result = await catalogClient.addLocation({
          dryRun: true,
          type: "url",
          target: catalogInfoUrl
        }, ((_b = ctx.secrets) == null ? void 0 : _b.backstageToken) ? { token: ctx.secrets.backstageToken } : {});
        if (result.entities.length > 0) {
          const { entities } = result;
          let entity;
          entity = entities.find((e) => !e.metadata.name.startsWith("generated-") && e.kind === "Component");
          if (!entity) {
            entity = entities.find((e) => !e.metadata.name.startsWith("generated-"));
          }
          if (!entity) {
            entity = entities[0];
          }
          ctx.output("entityRef", catalogModel.stringifyEntityRef(entity));
        }
      } catch (e) {
        if (!input.optional) {
          throw e;
        }
      }
      ctx.output("catalogInfoUrl", catalogInfoUrl);
    }
  });
}

function createCatalogWriteAction() {
  return createTemplateAction({
    id: "catalog:write",
    description: "Writes the catalog-info.yaml for your template",
    schema: {
      input: {
        type: "object",
        properties: {
          filePath: {
            title: "Catalog file path",
            description: "Defaults to catalog-info.yaml",
            type: "string"
          },
          entity: {
            title: "Entity info to write catalog-info.yaml",
            description: "You can provide the same values used in the Entity schema.",
            type: "object"
          }
        }
      }
    },
    async handler(ctx) {
      ctx.logStream.write(`Writing catalog-info.yaml`);
      const { filePath, entity } = ctx.input;
      const path = filePath != null ? filePath : "catalog-info.yaml";
      await fs__default["default"].writeFile(backendCommon.resolveSafeChildPath(ctx.workspacePath, path), yaml__namespace.stringify(entity));
    }
  });
}

function createDebugLogAction() {
  return createTemplateAction({
    id: "debug:log",
    description: "Writes a message into the log or lists all files in the workspace.",
    schema: {
      input: {
        type: "object",
        properties: {
          message: {
            title: "Message to output.",
            type: "string"
          },
          listWorkspace: {
            title: "List all files in the workspace, if true.",
            type: "boolean"
          },
          extra: {
            title: "Extra info"
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b;
      ctx.logger.info(JSON.stringify(ctx.input, null, 2));
      if ((_a = ctx.input) == null ? void 0 : _a.message) {
        ctx.logStream.write(ctx.input.message);
      }
      if ((_b = ctx.input) == null ? void 0 : _b.listWorkspace) {
        const files = await recursiveReadDir(ctx.workspacePath);
        ctx.logStream.write(`Workspace:
${files.map((f) => `  - ${path.relative(ctx.workspacePath, f)}`).join("\n")}`);
      }
    }
  });
}
async function recursiveReadDir(dir) {
  const subdirs = await fs.readdir(dir);
  const files = await Promise.all(subdirs.map(async (subdir) => {
    const res = path.join(dir, subdir);
    return (await fs.stat(res)).isDirectory() ? recursiveReadDir(res) : [res];
  }));
  return files.reduce((a, f) => a.concat(f), []);
}

async function fetchContents({
  reader,
  integrations,
  baseUrl,
  fetchUrl = ".",
  outputPath
}) {
  let fetchUrlIsAbsolute = false;
  try {
    new URL(fetchUrl);
    fetchUrlIsAbsolute = true;
  } catch {
  }
  if (!fetchUrlIsAbsolute && (baseUrl == null ? void 0 : baseUrl.startsWith("file://"))) {
    const basePath = baseUrl.slice("file://".length);
    const srcDir = backendCommon.resolveSafeChildPath(path__default["default"].dirname(basePath), fetchUrl);
    await fs__default["default"].copy(srcDir, outputPath);
  } else {
    let readUrl;
    if (fetchUrlIsAbsolute) {
      readUrl = fetchUrl;
    } else if (baseUrl) {
      const integration = integrations.byUrl(baseUrl);
      if (!integration) {
        throw new errors.InputError(`No integration found for location ${baseUrl}`);
      }
      readUrl = integration.resolveUrl({
        url: fetchUrl,
        base: baseUrl
      });
    } else {
      throw new errors.InputError(`Failed to fetch, template location could not be determined and the fetch URL is relative, ${fetchUrl}`);
    }
    const res = await reader.readTree(readUrl);
    await fs__default["default"].ensureDir(outputPath);
    await res.dir({ targetDir: outputPath });
  }
}

function createFetchPlainAction(options) {
  const { reader, integrations } = options;
  return createTemplateAction({
    id: "fetch:plain",
    description: "Downloads content and places it in the workspace, or optionally in a subdirectory specified by the 'targetPath' input option.",
    schema: {
      input: {
        type: "object",
        required: ["url"],
        properties: {
          url: {
            title: "Fetch URL",
            description: "Relative path or absolute URL pointing to the directory tree to fetch",
            type: "string"
          },
          targetPath: {
            title: "Target Path",
            description: "Target path within the working directory to download the contents to.",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b;
      ctx.logger.info("Fetching plain content from remote URL");
      const targetPath = (_a = ctx.input.targetPath) != null ? _a : "./";
      const outputPath = backendCommon.resolveSafeChildPath(ctx.workspacePath, targetPath);
      await fetchContents({
        reader,
        integrations,
        baseUrl: (_b = ctx.templateInfo) == null ? void 0 : _b.baseUrl,
        fetchUrl: ctx.input.url,
        outputPath
      });
    }
  });
}

const mkScript = (nunjucksSource) => `
const { render, renderCompat } = (() => {
  const module = {};
  const process = { env: {} };
  const require = (pkg) => { if (pkg === 'events') { return function (){}; }};

  ${nunjucksSource}

  const env = module.exports.configure({
    autoescape: false,
    tags: {
      variableStart: '\${{',
      variableEnd: '}}',
    },
  });

  const compatEnv = module.exports.configure({
    autoescape: false,
    tags: {
      variableStart: '{{',
      variableEnd: '}}',
    },
  });
  compatEnv.addFilter('jsonify', compatEnv.getFilter('dump'));

  if (typeof parseRepoUrl !== 'undefined') {
    const safeHelperRef = parseRepoUrl;

    env.addFilter('parseRepoUrl', repoUrl => {
      return JSON.parse(safeHelperRef(repoUrl))
    });
    env.addFilter('projectSlug', repoUrl => {
      const { owner, repo } = JSON.parse(safeHelperRef(repoUrl));
      return owner + '/' + repo;
    });
  }

  if (typeof additionalTemplateFilters !== 'undefined') {
    for (const [filterName, filterFn] of Object.entries(additionalTemplateFilters)) {
      env.addFilter(filterName, (...args) => JSON.parse(filterFn(...args)));
    }
  }

  let uninstallCompat = undefined;

  function render(str, values) {
    try {
      if (uninstallCompat) {
        uninstallCompat();
        uninstallCompat = undefined;
      }
      return env.renderString(str, JSON.parse(values));
    } catch (error) {
      // Make sure errors don't leak anything
      throw new Error(String(error.message));
    }
  }

  function renderCompat(str, values) {
    try {
      if (!uninstallCompat) {
        uninstallCompat = module.exports.installJinjaCompat();
      }
      return compatEnv.renderString(str, JSON.parse(values));
    } catch (error) {
      // Make sure errors don't leak anything
      throw new Error(String(error.message));
    }
  }

  return { render, renderCompat };
})();
`;
class SecureTemplater {
  static async loadRenderer(options = {}) {
    const { parseRepoUrl, cookiecutterCompat, additionalTemplateFilters } = options;
    const sandbox = {};
    if (parseRepoUrl) {
      sandbox.parseRepoUrl = (url) => JSON.stringify(parseRepoUrl(url));
    }
    if (additionalTemplateFilters) {
      sandbox.additionalTemplateFilters = Object.fromEntries(Object.entries(additionalTemplateFilters).filter(([_, filterFunction]) => !!filterFunction).map(([filterName, filterFunction]) => [
        filterName,
        (...args) => JSON.stringify(filterFunction(...args))
      ]));
    }
    const vm = new vm2.VM({ sandbox });
    const nunjucksSource = await fs__default["default"].readFile(backendCommon.resolvePackagePath("@backstage/plugin-scaffolder-backend", "assets/nunjucks.js.txt"), "utf-8");
    vm.run(mkScript(nunjucksSource));
    const render = (template, values) => {
      if (!vm) {
        throw new Error("SecureTemplater has not been initialized");
      }
      vm.setGlobal("templateStr", template);
      vm.setGlobal("templateValues", JSON.stringify(values));
      if (cookiecutterCompat) {
        return vm.run(`renderCompat(templateStr, templateValues)`);
      }
      return vm.run(`render(templateStr, templateValues)`);
    };
    return render;
  }
}

function createFetchTemplateAction(options) {
  const { reader, integrations, additionalTemplateFilters } = options;
  return createTemplateAction({
    id: "fetch:template",
    description: "Downloads a skeleton, templates variables into file and directory names and content, and places the result in the workspace, or optionally in a subdirectory specified by the 'targetPath' input option.",
    schema: {
      input: {
        type: "object",
        required: ["url"],
        properties: {
          url: {
            title: "Fetch URL",
            description: "Relative path or absolute URL pointing to the directory tree to fetch",
            type: "string"
          },
          targetPath: {
            title: "Target Path",
            description: "Target path within the working directory to download the contents to. Defaults to the working directory root.",
            type: "string"
          },
          values: {
            title: "Template Values",
            description: "Values to pass on to the templating engine",
            type: "object"
          },
          copyWithoutRender: {
            title: "Copy Without Render",
            description: "An array of glob patterns. Any files or directories which match are copied without being processed as templates.",
            type: "array",
            items: {
              type: "string"
            }
          },
          cookiecutterCompat: {
            title: "Cookiecutter compatibility mode",
            description: "Enable features to maximise compatibility with templates built for fetch:cookiecutter",
            type: "boolean"
          },
          templateFileExtension: {
            title: "Template File Extension",
            description: "If set, only files with the given extension will be templated. If set to `true`, the default extension `.njk` is used.",
            type: ["string", "boolean"]
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b;
      ctx.logger.info("Fetching template content from remote URL");
      const workDir = await ctx.createTemporaryDirectory();
      const templateDir = backendCommon.resolveSafeChildPath(workDir, "template");
      const targetPath = (_a = ctx.input.targetPath) != null ? _a : "./";
      const outputDir = backendCommon.resolveSafeChildPath(ctx.workspacePath, targetPath);
      if (ctx.input.copyWithoutRender && !Array.isArray(ctx.input.copyWithoutRender)) {
        throw new errors.InputError("Fetch action input copyWithoutRender must be an Array");
      }
      if (ctx.input.templateFileExtension && (ctx.input.copyWithoutRender || ctx.input.cookiecutterCompat)) {
        throw new errors.InputError("Fetch action input extension incompatible with copyWithoutRender and cookiecutterCompat");
      }
      let extension = false;
      if (ctx.input.templateFileExtension) {
        extension = ctx.input.templateFileExtension === true ? ".njk" : ctx.input.templateFileExtension;
        if (!extension.startsWith(".")) {
          extension = `.${extension}`;
        }
      }
      await fetchContents({
        reader,
        integrations,
        baseUrl: (_b = ctx.templateInfo) == null ? void 0 : _b.baseUrl,
        fetchUrl: ctx.input.url,
        outputPath: templateDir
      });
      ctx.logger.info("Listing files and directories in template");
      const allEntriesInTemplate = await globby__default["default"](`**/*`, {
        cwd: templateDir,
        dot: true,
        onlyFiles: false,
        markDirectories: true
      });
      const nonTemplatedEntries = new Set((await Promise.all((ctx.input.copyWithoutRender || []).map((pattern) => globby__default["default"](pattern, {
        cwd: templateDir,
        dot: true,
        onlyFiles: false,
        markDirectories: true
      })))).flat());
      const { cookiecutterCompat, values } = ctx.input;
      const context = {
        [cookiecutterCompat ? "cookiecutter" : "values"]: values
      };
      ctx.logger.info(`Processing ${allEntriesInTemplate.length} template files/directories with input values`, ctx.input.values);
      const renderTemplate = await SecureTemplater.loadRenderer({
        cookiecutterCompat: ctx.input.cookiecutterCompat,
        additionalTemplateFilters
      });
      for (const location of allEntriesInTemplate) {
        let renderFilename;
        let renderContents;
        let localOutputPath = location;
        if (extension) {
          renderFilename = true;
          renderContents = path.extname(localOutputPath) === extension;
          if (renderContents) {
            localOutputPath = localOutputPath.slice(0, -extension.length);
          }
        } else {
          renderFilename = renderContents = !nonTemplatedEntries.has(location);
        }
        if (renderFilename) {
          localOutputPath = renderTemplate(localOutputPath, context);
        }
        const outputPath = backendCommon.resolveSafeChildPath(outputDir, localOutputPath);
        if (outputDir === outputPath) {
          continue;
        }
        if (!renderContents && !extension) {
          ctx.logger.info(`Copying file/directory ${location} without processing.`);
        }
        if (location.endsWith("/")) {
          ctx.logger.info(`Writing directory ${location} to template output path.`);
          await fs__default["default"].ensureDir(outputPath);
        } else {
          const inputFilePath = backendCommon.resolveSafeChildPath(templateDir, location);
          if (await isbinaryfile.isBinaryFile(inputFilePath)) {
            ctx.logger.info(`Copying binary file ${location} to template output path.`);
            await fs__default["default"].copy(inputFilePath, outputPath);
          } else {
            const statsObj = await fs__default["default"].stat(inputFilePath);
            ctx.logger.info(`Writing file ${location} to template output path with mode ${statsObj.mode}.`);
            const inputFileContents = await fs__default["default"].readFile(inputFilePath, "utf-8");
            await fs__default["default"].outputFile(outputPath, renderContents ? renderTemplate(inputFileContents, context) : inputFileContents, { mode: statsObj.mode });
          }
        }
      }
      ctx.logger.info(`Template result written to ${outputDir}`);
    }
  });
}

const createFilesystemDeleteAction = () => {
  return createTemplateAction({
    id: "fs:delete",
    description: "Deletes files and directories from the workspace",
    schema: {
      input: {
        required: ["files"],
        type: "object",
        properties: {
          files: {
            title: "Files",
            description: "A list of files and directories that will be deleted",
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      }
    },
    async handler(ctx) {
      var _a;
      if (!Array.isArray((_a = ctx.input) == null ? void 0 : _a.files)) {
        throw new errors.InputError("files must be an Array");
      }
      for (const file of ctx.input.files) {
        const filepath = backendCommon.resolveSafeChildPath(ctx.workspacePath, file);
        try {
          await fs__default["default"].remove(filepath);
          ctx.logger.info(`File ${filepath} deleted successfully`);
        } catch (err) {
          ctx.logger.error(`Failed to delete file ${filepath}:`, err);
          throw err;
        }
      }
    }
  });
};

const createFilesystemRenameAction = () => {
  return createTemplateAction({
    id: "fs:rename",
    description: "Renames files and directories within the workspace",
    schema: {
      input: {
        required: ["files"],
        type: "object",
        properties: {
          files: {
            title: "Files",
            description: "A list of file and directory names that will be renamed",
            type: "array",
            items: {
              type: "object",
              required: ["from", "to"],
              properties: {
                from: {
                  type: "string",
                  title: "The source location of the file to be renamed"
                },
                to: {
                  type: "string",
                  title: "The destination of the new file"
                },
                overwrite: {
                  type: "boolean",
                  title: "Overwrite existing file or directory, default is false"
                }
              }
            }
          }
        }
      }
    },
    async handler(ctx) {
      var _a, _b;
      if (!Array.isArray((_a = ctx.input) == null ? void 0 : _a.files)) {
        throw new errors.InputError("files must be an Array");
      }
      for (const file of ctx.input.files) {
        if (!file.from || !file.to) {
          throw new errors.InputError("each file must have a from and to property");
        }
        const sourceFilepath = backendCommon.resolveSafeChildPath(ctx.workspacePath, file.from);
        const destFilepath = backendCommon.resolveSafeChildPath(ctx.workspacePath, file.to);
        try {
          await fs__default["default"].move(sourceFilepath, destFilepath, {
            overwrite: (_b = file.overwrite) != null ? _b : false
          });
          ctx.logger.info(`File ${sourceFilepath} renamed to ${destFilepath} successfully`);
        } catch (err) {
          ctx.logger.error(`Failed to rename file ${sourceFilepath} to ${destFilepath}:`, err);
          throw err;
        }
      }
    }
  });
};

const executeShellCommand = async (options) => {
  const {
    command,
    args,
    options: spawnOptions,
    logStream = new stream.PassThrough()
  } = options;
  await new Promise((resolve, reject) => {
    const process = child_process.spawn(command, args, spawnOptions);
    process.stdout.on("data", (stream) => {
      logStream.write(stream);
    });
    process.stderr.on("data", (stream) => {
      logStream.write(stream);
    });
    process.on("error", (error) => {
      return reject(error);
    });
    process.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Command ${command} failed, exit code: ${code}`));
      }
      return resolve();
    });
  });
};
async function initRepoAndPush({
  dir,
  remoteUrl,
  auth,
  logger,
  defaultBranch = "master",
  commitMessage = "Initial commit",
  gitAuthorInfo
}) {
  var _a, _b;
  const git = backendCommon.Git.fromAuth({
    username: auth.username,
    password: auth.password,
    logger
  });
  await git.init({
    dir,
    defaultBranch
  });
  await git.add({ dir, filepath: "." });
  const authorInfo = {
    name: (_a = gitAuthorInfo == null ? void 0 : gitAuthorInfo.name) != null ? _a : "Scaffolder",
    email: (_b = gitAuthorInfo == null ? void 0 : gitAuthorInfo.email) != null ? _b : "scaffolder@backstage.io"
  };
  await git.commit({
    dir,
    message: commitMessage,
    author: authorInfo,
    committer: authorInfo
  });
  await git.addRemote({
    dir,
    url: remoteUrl,
    remote: "origin"
  });
  await git.push({
    dir,
    remote: "origin"
  });
}
const enableBranchProtectionOnDefaultRepoBranch = async ({
  repoName,
  client,
  owner,
  logger,
  requireCodeOwnerReviews,
  requiredStatusCheckContexts = [],
  defaultBranch = "master"
}) => {
  const tryOnce = async () => {
    try {
      await client.rest.repos.updateBranchProtection({
        mediaType: {
          previews: ["luke-cage-preview"]
        },
        owner,
        repo: repoName,
        branch: defaultBranch,
        required_status_checks: {
          strict: true,
          contexts: requiredStatusCheckContexts
        },
        restrictions: null,
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          require_code_owner_reviews: requireCodeOwnerReviews
        }
      });
    } catch (e) {
      errors.assertError(e);
      if (e.message.includes("Upgrade to GitHub Pro or make this repository public to enable this feature")) {
        logger.warn("Branch protection was not enabled as it requires GitHub Pro for private repositories");
      } else {
        throw e;
      }
    }
  };
  try {
    await tryOnce();
  } catch (e) {
    if (!e.message.includes("Branch not found")) {
      throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    await tryOnce();
  }
};

const getRepoSourceDirectory = (workspacePath, sourcePath) => {
  if (sourcePath) {
    const safeSuffix = path.normalize(sourcePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const path$1 = path.join(workspacePath, safeSuffix);
    if (!backendCommon.isChildPath(workspacePath, path$1)) {
      throw new Error("Invalid source path");
    }
    return path$1;
  }
  return workspacePath;
};
const parseRepoUrl = (repoUrl, integrations) => {
  var _a, _b, _c, _d, _e;
  let parsed;
  try {
    parsed = new URL(`https://${repoUrl}`);
  } catch (error) {
    throw new errors.InputError(`Invalid repo URL passed to publisher, got ${repoUrl}, ${error}`);
  }
  const host = parsed.host;
  const owner = (_a = parsed.searchParams.get("owner")) != null ? _a : void 0;
  const organization = (_b = parsed.searchParams.get("organization")) != null ? _b : void 0;
  const workspace = (_c = parsed.searchParams.get("workspace")) != null ? _c : void 0;
  const project = (_d = parsed.searchParams.get("project")) != null ? _d : void 0;
  const type = (_e = integrations.byHost(host)) == null ? void 0 : _e.type;
  if (!type) {
    throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
  }
  if (type === "bitbucket") {
    if (host === "bitbucket.org") {
      if (!workspace) {
        throw new errors.InputError(`Invalid repo URL passed to publisher: ${repoUrl}, missing workspace`);
      }
    }
    if (!project) {
      throw new errors.InputError(`Invalid repo URL passed to publisher: ${repoUrl}, missing project`);
    }
  } else {
    if (!owner) {
      throw new errors.InputError(`Invalid repo URL passed to publisher: ${repoUrl}, missing owner`);
    }
  }
  const repo = parsed.searchParams.get("repo");
  if (!repo) {
    throw new errors.InputError(`Invalid repo URL passed to publisher: ${repoUrl}, missing repo`);
  }
  return { host, owner, repo, organization, workspace, project };
};
const isExecutable = (fileMode) => {
  const executeBitMask = 73;
  const res = fileMode & executeBitMask;
  return res > 0;
};

function createPublishAzureAction(options) {
  const { integrations, config } = options;
  return createTemplateAction({
    id: "publish:azure",
    description: "Initializes a git repository of the content in the workspace, and publishes it to Azure.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: `Sets the commit message on the repository. The default value is 'initial commit'`
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: `Sets the default author email for the commit.`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to Azure"
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      var _a;
      const {
        repoUrl,
        defaultBranch = "master",
        gitCommitMessage = "initial commit",
        gitAuthorName,
        gitAuthorEmail
      } = ctx.input;
      const { owner, repo, host, organization } = parseRepoUrl(repoUrl, integrations);
      if (!organization) {
        throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing organization`);
      }
      const integrationConfig = integrations.azure.byHost(host);
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      if (!integrationConfig.config.token && !ctx.input.token) {
        throw new errors.InputError(`No token provided for Azure Integration ${host}`);
      }
      const token = (_a = ctx.input.token) != null ? _a : integrationConfig.config.token;
      const authHandler = azureDevopsNodeApi.getPersonalAccessTokenHandler(token);
      const webApi = new azureDevopsNodeApi.WebApi(`https://${host}/${organization}`, authHandler);
      const client = await webApi.getGitApi();
      const createOptions = { name: repo };
      const returnedRepo = await client.createRepository(createOptions, owner);
      if (!returnedRepo) {
        throw new errors.InputError(`Unable to create the repository with Organization ${organization}, Project ${owner} and Repo ${repo}.
          Please make sure that both the Org and Project are typed corrected and exist.`);
      }
      const remoteUrl = returnedRepo.remoteUrl;
      if (!remoteUrl) {
        throw new errors.InputError("No remote URL returned from create repository for Azure");
      }
      const repoContentsUrl = remoteUrl;
      const gitAuthorInfo = {
        name: gitAuthorName ? gitAuthorName : config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: gitAuthorEmail ? gitAuthorEmail : config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl,
        defaultBranch,
        auth: {
          username: "notempty",
          password: token
        },
        logger: ctx.logger,
        commitMessage: gitCommitMessage ? gitCommitMessage : config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

const createBitbucketCloudRepository = async (opts) => {
  const {
    workspace,
    project,
    repo,
    description,
    repoVisibility,
    mainBranch,
    authorization,
    apiBaseUrl
  } = opts;
  const options = {
    method: "POST",
    body: JSON.stringify({
      scm: "git",
      description,
      is_private: repoVisibility === "private",
      project: { key: project }
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    }
  };
  let response;
  try {
    response = await fetch__default["default"](`${apiBaseUrl}/repositories/${workspace}/${repo}`, options);
  } catch (e) {
    throw new Error(`Unable to create repository, ${e}`);
  }
  if (response.status !== 200) {
    throw new Error(`Unable to create repository, ${response.status} ${response.statusText}, ${await response.text()}`);
  }
  const r = await response.json();
  let remoteUrl = "";
  for (const link of r.links.clone) {
    if (link.name === "https") {
      remoteUrl = link.href;
    }
  }
  const repoContentsUrl = `${r.links.html.href}/src/${mainBranch}`;
  return { remoteUrl, repoContentsUrl };
};
const createBitbucketServerRepository = async (opts) => {
  const {
    project,
    repo,
    description,
    authorization,
    repoVisibility,
    apiBaseUrl
  } = opts;
  let response;
  const options = {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      description,
      public: repoVisibility === "public"
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    }
  };
  try {
    response = await fetch__default["default"](`${apiBaseUrl}/projects/${project}/repos`, options);
  } catch (e) {
    throw new Error(`Unable to create repository, ${e}`);
  }
  if (response.status !== 201) {
    throw new Error(`Unable to create repository, ${response.status} ${response.statusText}, ${await response.text()}`);
  }
  const r = await response.json();
  let remoteUrl = "";
  for (const link of r.links.clone) {
    if (link.name === "http") {
      remoteUrl = link.href;
    }
  }
  const repoContentsUrl = `${r.links.self[0].href}`;
  return { remoteUrl, repoContentsUrl };
};
const getAuthorizationHeader$2 = (config) => {
  if (config.username && config.appPassword) {
    const buffer = Buffer.from(`${config.username}:${config.appPassword}`, "utf8");
    return `Basic ${buffer.toString("base64")}`;
  }
  if (config.token) {
    return `Bearer ${config.token}`;
  }
  throw new Error(`Authorization has not been provided for Bitbucket. Please add either username + appPassword or token to the Integrations config`);
};
const performEnableLFS$1 = async (opts) => {
  const { authorization, host, project, repo } = opts;
  const options = {
    method: "PUT",
    headers: {
      Authorization: authorization
    }
  };
  const { ok, status, statusText } = await fetch__default["default"](`https://${host}/rest/git-lfs/admin/projects/${project}/repos/${repo}/enabled`, options);
  if (!ok)
    throw new Error(`Failed to enable LFS in the repository, ${status}: ${statusText}`);
};
function createPublishBitbucketAction(options) {
  const { integrations, config } = options;
  return createTemplateAction({
    id: "publish:bitbucket",
    description: "Initializes a git repository of the content in the workspace, and publishes it to Bitbucket.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          enableLFS: {
            title: "Enable LFS?",
            description: "Enable LFS for the repository. Only available for hosted Bitbucket.",
            type: "boolean"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to BitBucket"
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: `Sets the commit message on the repository. The default value is 'initial commit'`
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: `Sets the default author email for the commit.`
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      var _a;
      ctx.logger.warn(`[Deprecated] Please migrate the use of action "publish:bitbucket" to "publish:bitbucketCloud" or "publish:bitbucketServer".`);
      const {
        repoUrl,
        description,
        defaultBranch = "master",
        repoVisibility = "private",
        enableLFS = false,
        gitCommitMessage = "initial commit",
        gitAuthorName,
        gitAuthorEmail
      } = ctx.input;
      const { workspace, project, repo, host } = parseRepoUrl(repoUrl, integrations);
      if (host === "bitbucket.org") {
        if (!workspace) {
          throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing workspace`);
        }
      }
      if (!project) {
        throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing project`);
      }
      const integrationConfig = integrations.bitbucket.byHost(host);
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      const authorization = getAuthorizationHeader$2(ctx.input.token ? {
        host: integrationConfig.config.host,
        apiBaseUrl: integrationConfig.config.apiBaseUrl,
        token: ctx.input.token
      } : integrationConfig.config);
      const apiBaseUrl = integrationConfig.config.apiBaseUrl;
      const createMethod = host === "bitbucket.org" ? createBitbucketCloudRepository : createBitbucketServerRepository;
      const { remoteUrl, repoContentsUrl } = await createMethod({
        authorization,
        workspace: workspace || "",
        project,
        repo,
        repoVisibility,
        mainBranch: defaultBranch,
        description,
        apiBaseUrl
      });
      const gitAuthorInfo = {
        name: gitAuthorName ? gitAuthorName : config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: gitAuthorEmail ? gitAuthorEmail : config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      let auth;
      if (ctx.input.token) {
        auth = {
          username: "x-token-auth",
          password: ctx.input.token
        };
      } else {
        auth = {
          username: integrationConfig.config.username ? integrationConfig.config.username : "x-token-auth",
          password: integrationConfig.config.appPassword ? integrationConfig.config.appPassword : (_a = integrationConfig.config.token) != null ? _a : ""
        };
      }
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl,
        auth,
        defaultBranch,
        logger: ctx.logger,
        commitMessage: gitCommitMessage ? gitCommitMessage : config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      if (enableLFS && host !== "bitbucket.org") {
        await performEnableLFS$1({ authorization, host, project, repo });
      }
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

const createRepository$1 = async (opts) => {
  const {
    workspace,
    project,
    repo,
    description,
    repoVisibility,
    mainBranch,
    authorization,
    apiBaseUrl
  } = opts;
  const options = {
    method: "POST",
    body: JSON.stringify({
      scm: "git",
      description,
      is_private: repoVisibility === "private",
      project: { key: project }
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    }
  };
  let response;
  try {
    response = await fetch__default["default"](`${apiBaseUrl}/repositories/${workspace}/${repo}`, options);
  } catch (e) {
    throw new Error(`Unable to create repository, ${e}`);
  }
  if (response.status !== 200) {
    throw new Error(`Unable to create repository, ${response.status} ${response.statusText}, ${await response.text()}`);
  }
  const r = await response.json();
  let remoteUrl = "";
  for (const link of r.links.clone) {
    if (link.name === "https") {
      remoteUrl = link.href;
    }
  }
  const repoContentsUrl = `${r.links.html.href}/src/${mainBranch}`;
  return { remoteUrl, repoContentsUrl };
};
const getAuthorizationHeader$1 = (config) => {
  if (config.username && config.appPassword) {
    const buffer = Buffer.from(`${config.username}:${config.appPassword}`, "utf8");
    return `Basic ${buffer.toString("base64")}`;
  }
  if (config.token) {
    return `Bearer ${config.token}`;
  }
  throw new Error(`Authorization has not been provided for Bitbucket Cloud. Please add either username + appPassword to the Integrations config or a user login auth token`);
};
function createPublishBitbucketCloudAction(options) {
  const { integrations, config } = options;
  return createTemplateAction({
    id: "publish:bitbucketCloud",
    description: "Initializes a git repository of the content in the workspace, and publishes it to Bitbucket Cloud.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to BitBucket Cloud"
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        description,
        defaultBranch = "master",
        repoVisibility = "private"
      } = ctx.input;
      const { workspace, project, repo, host } = parseRepoUrl(repoUrl, integrations);
      if (!workspace) {
        throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing workspace`);
      }
      if (!project) {
        throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing project`);
      }
      const integrationConfig = integrations.bitbucketCloud.byHost(host);
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      const authorization = getAuthorizationHeader$1(ctx.input.token ? { token: ctx.input.token } : integrationConfig.config);
      const apiBaseUrl = integrationConfig.config.apiBaseUrl;
      const { remoteUrl, repoContentsUrl } = await createRepository$1({
        authorization,
        workspace: workspace || "",
        project,
        repo,
        repoVisibility,
        mainBranch: defaultBranch,
        description,
        apiBaseUrl
      });
      const gitAuthorInfo = {
        name: config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      let auth;
      if (ctx.input.token) {
        auth = {
          username: "x-token-auth",
          password: ctx.input.token
        };
      } else {
        if (!integrationConfig.config.username || !integrationConfig.config.appPassword) {
          throw new Error("Credentials for Bitbucket Cloud integration required for this action.");
        }
        auth = {
          username: integrationConfig.config.username,
          password: integrationConfig.config.appPassword
        };
      }
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl,
        auth,
        defaultBranch,
        logger: ctx.logger,
        commitMessage: config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

const createRepository = async (opts) => {
  const {
    project,
    repo,
    description,
    authorization,
    repoVisibility,
    apiBaseUrl
  } = opts;
  let response;
  const options = {
    method: "POST",
    body: JSON.stringify({
      name: repo,
      description,
      public: repoVisibility === "public"
    }),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json"
    }
  };
  try {
    response = await fetch__default["default"](`${apiBaseUrl}/projects/${project}/repos`, options);
  } catch (e) {
    throw new Error(`Unable to create repository, ${e}`);
  }
  if (response.status !== 201) {
    throw new Error(`Unable to create repository, ${response.status} ${response.statusText}, ${await response.text()}`);
  }
  const r = await response.json();
  let remoteUrl = "";
  for (const link of r.links.clone) {
    if (link.name === "http") {
      remoteUrl = link.href;
    }
  }
  const repoContentsUrl = `${r.links.self[0].href}`;
  return { remoteUrl, repoContentsUrl };
};
const getAuthorizationHeader = (config) => {
  return `Bearer ${config.token}`;
};
const performEnableLFS = async (opts) => {
  const { authorization, host, project, repo } = opts;
  const options = {
    method: "PUT",
    headers: {
      Authorization: authorization
    }
  };
  const { ok, status, statusText } = await fetch__default["default"](`https://${host}/rest/git-lfs/admin/projects/${project}/repos/${repo}/enabled`, options);
  if (!ok)
    throw new Error(`Failed to enable LFS in the repository, ${status}: ${statusText}`);
};
function createPublishBitbucketServerAction(options) {
  const { integrations, config } = options;
  return createTemplateAction({
    id: "publish:bitbucketServer",
    description: "Initializes a git repository of the content in the workspace, and publishes it to Bitbucket Server.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          enableLFS: {
            title: "Enable LFS?",
            description: "Enable LFS for the repository.",
            type: "boolean"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to BitBucket Server"
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      var _a;
      const {
        repoUrl,
        description,
        defaultBranch = "master",
        repoVisibility = "private",
        enableLFS = false
      } = ctx.input;
      const { project, repo, host } = parseRepoUrl(repoUrl, integrations);
      if (!project) {
        throw new errors.InputError(`Invalid URL provider was included in the repo URL to create ${ctx.input.repoUrl}, missing project`);
      }
      const integrationConfig = integrations.bitbucketServer.byHost(host);
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      const token = (_a = ctx.input.token) != null ? _a : integrationConfig.config.token;
      if (!token) {
        throw new Error(`Authorization has not been provided for ${integrationConfig.config.host}. Please add either token to the Integrations config or a user login auth token`);
      }
      const authorization = getAuthorizationHeader({ token });
      const apiBaseUrl = integrationConfig.config.apiBaseUrl;
      const { remoteUrl, repoContentsUrl } = await createRepository({
        authorization,
        project,
        repo,
        repoVisibility,
        description,
        apiBaseUrl
      });
      const gitAuthorInfo = {
        name: config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      const auth = {
        username: "x-token-auth",
        password: token
      };
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl,
        auth,
        defaultBranch,
        logger: ctx.logger,
        commitMessage: config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      if (enableLFS) {
        await performEnableLFS({ authorization, host, project, repo });
      }
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

function createPublishFileAction() {
  return createTemplateAction({
    id: "publish:file",
    description: "Writes contents of the workspace to a local directory",
    schema: {
      input: {
        type: "object",
        required: ["path"],
        properties: {
          path: {
            title: "Path to a directory where the output will be written",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      const { path: path$1 } = ctx.input;
      const exists = await fs__default["default"].pathExists(path$1);
      if (exists) {
        throw new errors.InputError("Output path already exists");
      }
      await fs__default["default"].ensureDir(path.dirname(path$1));
      await fs__default["default"].copy(ctx.workspacePath, path$1);
    }
  });
}

const DEFAULT_TIMEOUT_MS = 6e4;
async function getOctokitOptions(options) {
  var _a;
  const { integrations, credentialsProvider, repoUrl, token } = options;
  const { owner, repo, host } = parseRepoUrl(repoUrl, integrations);
  const requestOptions = {
    timeout: DEFAULT_TIMEOUT_MS
  };
  if (!owner) {
    throw new errors.InputError(`No owner provided for repo ${repoUrl}`);
  }
  const integrationConfig = (_a = integrations.github.byHost(host)) == null ? void 0 : _a.config;
  if (!integrationConfig) {
    throw new errors.InputError(`No integration for host ${host}`);
  }
  if (token) {
    return {
      auth: token,
      baseUrl: integrationConfig.apiBaseUrl,
      previews: ["nebula-preview"],
      request: requestOptions
    };
  }
  const githubCredentialsProvider = credentialsProvider != null ? credentialsProvider : integration.DefaultGithubCredentialsProvider.fromIntegrations(integrations);
  const { token: credentialProviderToken } = await githubCredentialsProvider.getCredentials({
    url: `https://${host}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  });
  if (!credentialProviderToken) {
    throw new errors.InputError(`No token available for host: ${host}, with owner ${owner}, and repo ${repo}`);
  }
  return {
    auth: credentialProviderToken,
    baseUrl: integrationConfig.apiBaseUrl,
    previews: ["nebula-preview"]
  };
}

function createPublishGithubAction(options) {
  const { integrations, config, githubCredentialsProvider } = options;
  return createTemplateAction({
    id: "publish:github",
    description: "Initializes a git repository of contents in workspace and publishes it to GitHub.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the new repository name and 'owner' is an organization or username`,
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          access: {
            title: "Repository Access",
            description: `Sets an admin collaborator on the repository. Can either be a user reference different from 'owner' in 'repoUrl' or team reference, eg. 'org/team-name'`,
            type: "string"
          },
          requireCodeOwnerReviews: {
            title: "Require CODEOWNER Reviews?",
            description: "Require an approved review in PR including files with a designated Code Owner",
            type: "boolean"
          },
          requiredStatusCheckContexts: {
            title: "Required Status Check Contexts",
            description: "The list of status checks to require in order to merge into this branch",
            type: "array",
            items: {
              type: "string"
            }
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public", "internal"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          deleteBranchOnMerge: {
            title: "Delete Branch On Merge",
            type: "boolean",
            description: `Delete the branch after merging the PR. The default value is 'false'`
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: `Sets the commit message on the repository. The default value is 'initial commit'`
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: `Sets the default author email for the commit.`
          },
          allowMergeCommit: {
            title: "Allow Merge Commits",
            type: "boolean",
            description: `Allow merge commits. The default value is 'true'`
          },
          allowSquashMerge: {
            title: "Allow Squash Merges",
            type: "boolean",
            description: `Allow squash merges. The default value is 'true'`
          },
          allowRebaseMerge: {
            title: "Allow Rebase Merges",
            type: "boolean",
            description: `Allow rebase merges. The default value is 'true'`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          collaborators: {
            title: "Collaborators",
            description: "Provide additional users with permissions",
            type: "array",
            items: {
              type: "object",
              required: ["username", "access"],
              properties: {
                access: {
                  type: "string",
                  description: "The type of access for the user",
                  enum: ["push", "pull", "admin", "maintain", "triage"]
                },
                username: {
                  type: "string",
                  description: "The username or group"
                }
              }
            }
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to GitHub"
          },
          topics: {
            title: "Topics",
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        description,
        access,
        requireCodeOwnerReviews = false,
        requiredStatusCheckContexts = [],
        repoVisibility = "private",
        defaultBranch = "master",
        deleteBranchOnMerge = false,
        gitCommitMessage = "initial commit",
        gitAuthorName,
        gitAuthorEmail,
        allowMergeCommit = true,
        allowSquashMerge = true,
        allowRebaseMerge = true,
        collaborators,
        topics,
        token: providedToken
      } = ctx.input;
      const { owner, repo } = parseRepoUrl(repoUrl, integrations);
      if (!owner) {
        throw new errors.InputError("Invalid repository owner provided in repoUrl");
      }
      const octokitOptions = await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        token: providedToken,
        repoUrl
      });
      const client = new octokit.Octokit(octokitOptions);
      const user = await client.rest.users.getByUsername({
        username: owner
      });
      const repoCreationPromise = user.data.type === "Organization" ? client.rest.repos.createInOrg({
        name: repo,
        org: owner,
        private: repoVisibility === "private",
        visibility: repoVisibility,
        description,
        delete_branch_on_merge: deleteBranchOnMerge,
        allow_merge_commit: allowMergeCommit,
        allow_squash_merge: allowSquashMerge,
        allow_rebase_merge: allowRebaseMerge
      }) : client.rest.repos.createForAuthenticatedUser({
        name: repo,
        private: repoVisibility === "private",
        description,
        delete_branch_on_merge: deleteBranchOnMerge,
        allow_merge_commit: allowMergeCommit,
        allow_squash_merge: allowSquashMerge,
        allow_rebase_merge: allowRebaseMerge
      });
      const { data: newRepo } = await repoCreationPromise;
      if (access == null ? void 0 : access.startsWith(`${owner}/`)) {
        const [, team] = access.split("/");
        await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
          org: owner,
          team_slug: team,
          owner,
          repo,
          permission: "admin"
        });
      } else if (access && access !== owner) {
        await client.rest.repos.addCollaborator({
          owner,
          repo,
          username: access,
          permission: "admin"
        });
      }
      if (collaborators) {
        for (const {
          access: permission,
          username: team_slug
        } of collaborators) {
          try {
            await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
              org: owner,
              team_slug,
              owner,
              repo,
              permission
            });
          } catch (e) {
            errors.assertError(e);
            ctx.logger.warn(`Skipping ${permission} access for ${team_slug}, ${e.message}`);
          }
        }
      }
      if (topics) {
        try {
          await client.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: topics.map((t) => t.toLowerCase())
          });
        } catch (e) {
          errors.assertError(e);
          ctx.logger.warn(`Skipping topics ${topics.join(" ")}, ${e.message}`);
        }
      }
      const remoteUrl = newRepo.clone_url;
      const repoContentsUrl = `${newRepo.html_url}/blob/${defaultBranch}`;
      const gitAuthorInfo = {
        name: gitAuthorName ? gitAuthorName : config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: gitAuthorEmail ? gitAuthorEmail : config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl,
        defaultBranch,
        auth: {
          username: "x-access-token",
          password: octokitOptions.auth
        },
        logger: ctx.logger,
        commitMessage: gitCommitMessage ? gitCommitMessage : config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      try {
        await enableBranchProtectionOnDefaultRepoBranch({
          owner,
          client,
          repoName: newRepo.name,
          logger: ctx.logger,
          defaultBranch,
          requireCodeOwnerReviews,
          requiredStatusCheckContexts
        });
      } catch (e) {
        errors.assertError(e);
        ctx.logger.warn(`Skipping: default branch protection on '${newRepo.name}', ${e.message}`);
      }
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

function createPublishGithubTemplateAction(options) {
  const { integrations, githubCredentialsProvider } = options;
  return createTemplateAction({
    id: "publish:github:template",
    description: "Initializes a git repository, based on a GitHub template, of contents in workspace and publishes it to GitHub.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl", "templateUrl"],
        properties: {
          templateUrl: {
            title: "Repository Template Location",
            description: `Accepts the format 'github.com?repo=templatename&owner=owner' where 'templatename' is the name of the template and 'owner' is an organization or username`,
            type: "string"
          },
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the new repository name and 'owner' is an organization or username`,
            type: "string"
          },
          description: {
            title: "Repository Description",
            type: "string"
          },
          access: {
            title: "Repository Access",
            description: `Sets an admin collaborator on the repository. Can either be a user reference different from 'owner' in 'repoUrl' or team reference, eg. 'org/team-name'`,
            type: "string"
          },
          requireCodeOwnerReviews: {
            title: "Require CODEOWNER Reviews?",
            description: "Require an approved review in PR including files with a designated Code Owner",
            type: "boolean"
          },
          requiredStatusCheckContexts: {
            title: "Required Status Check Contexts",
            description: "The list of status checks to require in order to merge into this branch",
            type: "array",
            items: {
              type: "string"
            }
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public", "internal"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          deleteBranchOnMerge: {
            title: "Delete Branch On Merge",
            type: "boolean",
            description: `Delete the branch after merging the PR. The default value is 'false'`
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: `Sets the commit message on the repository. The default value is 'initial commit'`
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: `Sets the default author email for the commit.`
          },
          allowMergeCommit: {
            title: "Allow Merge Commits",
            type: "boolean",
            description: `Allow merge commits. The default value is 'true'`
          },
          allowSquashMerge: {
            title: "Allow Squash Merges",
            type: "boolean",
            description: `Allow squash merges. The default value is 'true'`
          },
          allowRebaseMerge: {
            title: "Allow Rebase Merges",
            type: "boolean",
            description: `Allow rebase merges. The default value is 'true'`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          collaborators: {
            title: "Collaborators",
            description: "Provide additional users with permissions",
            type: "array",
            items: {
              type: "object",
              required: ["username", "access"],
              properties: {
                access: {
                  type: "string",
                  description: "The type of access for the user",
                  enum: ["push", "pull", "admin", "maintain", "triage"]
                },
                username: {
                  type: "string",
                  description: "The username or group"
                }
              }
            }
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to GitHub"
          },
          topics: {
            title: "Topics",
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        templateUrl,
        repoUrl,
        description,
        access,
        requireCodeOwnerReviews = false,
        requiredStatusCheckContexts = [],
        repoVisibility = "private",
        defaultBranch = "master",
        collaborators,
        topics,
        token: providedToken
      } = ctx.input;
      const { owner, repo } = parseRepoUrl(repoUrl, integrations);
      const parsedTemplate = parseRepoUrl(templateUrl, integrations);
      const templateOwner = parsedTemplate.owner;
      const templateRepo = parsedTemplate.repo;
      if (!owner) {
        throw new errors.InputError("Invalid repository owner provided in repoUrl");
      }
      if (!templateOwner) {
        throw new errors.InputError("Invalid template repository owner provided in templateUrl");
      }
      const octokitOptions = await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        token: providedToken,
        repoUrl
      });
      const client = new octokit.Octokit(octokitOptions);
      const repoTemplatePromise = client.rest.repos.get({
        owner: templateOwner,
        repo: templateRepo
      });
      const { data: repoTemplate } = await repoTemplatePromise;
      if (!repoTemplate.is_template) {
        throw new errors.InputError("Invalid template repository provided in templateUrl, is the repository a GitHub template?");
      }
      const repoCreationPromise = client.rest.repos.createUsingTemplate({
        template_owner: templateOwner,
        template_repo: templateRepo,
        name: repo,
        owner,
        private: true,
        description
      });
      const { data: newRepo } = await repoCreationPromise;
      if (access == null ? void 0 : access.startsWith(`${owner}/`)) {
        const [, team] = access.split("/");
        await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
          org: owner,
          team_slug: team,
          owner,
          repo,
          permission: "admin"
        });
      } else if (access && access !== owner) {
        await client.rest.repos.addCollaborator({
          owner,
          repo,
          username: access,
          permission: "admin"
        });
      }
      if (collaborators) {
        for (const {
          access: permission,
          username: team_slug
        } of collaborators) {
          try {
            await client.rest.teams.addOrUpdateRepoPermissionsInOrg({
              org: owner,
              team_slug,
              owner,
              repo,
              permission
            });
          } catch (e) {
            errors.assertError(e);
            ctx.logger.warn(`Skipping ${permission} access for ${team_slug}, ${e.message}`);
          }
        }
      }
      if (topics) {
        try {
          await client.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: topics.map((t) => t.toLowerCase())
          });
        } catch (e) {
          errors.assertError(e);
          ctx.logger.warn(`Skipping topics ${topics.join(" ")}, ${e.message}`);
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
          requiredStatusCheckContexts
        });
      } catch (e) {
        errors.assertError(e);
        ctx.logger.warn(`Skipping: default branch protection on '${newRepo.name}', ${e.message}`);
      }
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

class GithubResponseError extends errors.CustomErrorBase {
}
const defaultClientFactory = async ({
  integrations,
  githubCredentialsProvider,
  owner,
  repo,
  host = "github.com",
  token: providedToken
}) => {
  const [encodedHost, encodedOwner, encodedRepo] = [host, owner, repo].map(encodeURIComponent);
  const octokitOptions = await getOctokitOptions({
    integrations,
    credentialsProvider: githubCredentialsProvider,
    repoUrl: `${encodedHost}?owner=${encodedOwner}&repo=${encodedRepo}`,
    token: providedToken
  });
  const OctokitPR = octokit.Octokit.plugin(octokitPluginCreatePullRequest.createPullRequest);
  return new OctokitPR(octokitOptions);
};
const createPublishGithubPullRequestAction = ({
  integrations,
  githubCredentialsProvider,
  clientFactory = defaultClientFactory
}) => {
  return createTemplateAction({
    id: "publish:github:pull-request",
    schema: {
      input: {
        required: ["repoUrl", "title", "description", "branchName"],
        type: "object",
        properties: {
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the repository name and 'owner' is an organization or username`,
            type: "string"
          },
          branchName: {
            type: "string",
            title: "Branch Name",
            description: "The name for the branch"
          },
          title: {
            type: "string",
            title: "Pull Request Name",
            description: "The name for the pull request"
          },
          description: {
            type: "string",
            title: "Pull Request Description",
            description: "The description of the pull request"
          },
          draft: {
            type: "boolean",
            title: "Create as Draft",
            description: "Create a draft pull request"
          },
          sourcePath: {
            type: "string",
            title: "Working Subdirectory",
            description: "Subdirectory of working directory to copy changes from"
          },
          targetPath: {
            type: "string",
            title: "Repository Subdirectory",
            description: "Subdirectory of repository to apply changes to"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to GitHub"
          }
        }
      },
      output: {
        required: ["remoteUrl"],
        type: "object",
        properties: {
          remoteUrl: {
            type: "string",
            title: "Pull Request URL",
            description: "Link to the pull request in Github"
          },
          pullRequestNumber: {
            type: "number",
            title: "Pull Request Number",
            description: "The pull request number"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        branchName,
        title,
        description,
        draft,
        targetPath,
        sourcePath,
        token: providedToken
      } = ctx.input;
      const { owner, repo, host } = parseRepoUrl(repoUrl, integrations);
      if (!owner) {
        throw new errors.InputError(`No owner provided for host: ${host}, and repo ${repo}`);
      }
      const client = await clientFactory({
        integrations,
        githubCredentialsProvider,
        host,
        owner,
        repo,
        token: providedToken
      });
      const fileRoot = sourcePath ? backendCommon.resolveSafeChildPath(ctx.workspacePath, sourcePath) : ctx.workspacePath;
      const localFilePaths = await globby__default["default"](["./**", "./**/.*", "!.git"], {
        cwd: fileRoot,
        gitignore: true,
        dot: true
      });
      const fileContents = await Promise.all(localFilePaths.map((filePath) => {
        const absPath = backendCommon.resolveSafeChildPath(fileRoot, filePath);
        const base64EncodedContent = fs__default["default"].readFileSync(absPath).toString("base64");
        const fileStat = fs__default["default"].statSync(absPath);
        const githubTreeItemMode = isExecutable(fileStat.mode) ? "100755" : "100644";
        const encoding = "base64";
        return {
          encoding,
          content: base64EncodedContent,
          mode: githubTreeItemMode
        };
      }));
      const repoFilePaths = localFilePaths.map((repoFilePath) => {
        return targetPath ? `${targetPath}/${repoFilePath}` : repoFilePath;
      });
      const changes = [
        {
          files: lodash.zipObject(repoFilePaths, fileContents),
          commit: title
        }
      ];
      try {
        const response = await client.createPullRequest({
          owner,
          repo,
          title,
          changes,
          body: description,
          head: branchName,
          draft
        });
        if (!response) {
          throw new GithubResponseError("null response from Github");
        }
        ctx.output("remoteUrl", response.data.html_url);
        ctx.output("pullRequestNumber", response.data.number);
      } catch (e) {
        throw new GithubResponseError("Pull request creation failed", e);
      }
    }
  });
};

function createPublishGitlabAction(options) {
  const { integrations, config } = options;
  return createTemplateAction({
    id: "publish:gitlab",
    description: "Initializes a git repository of the content in the workspace, and publishes it to GitLab.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            type: "string"
          },
          repoVisibility: {
            title: "Repository Visibility",
            type: "string",
            enum: ["private", "public", "internal"]
          },
          defaultBranch: {
            title: "Default Branch",
            type: "string",
            description: `Sets the default branch on the repository. The default value is 'master'`
          },
          gitCommitMessage: {
            title: "Git Commit Message",
            type: "string",
            description: `Sets the commit message on the repository. The default value is 'initial commit'`
          },
          gitAuthorName: {
            title: "Default Author Name",
            type: "string",
            description: `Sets the default author name for the commit. The default value is 'Scaffolder'`
          },
          gitAuthorEmail: {
            title: "Default Author Email",
            type: "string",
            description: `Sets the default author email for the commit.`
          },
          sourcePath: {
            title: "Source Path",
            description: "Path within the workspace that will be used as the repository root. If omitted, the entire workspace will be published as the repository.",
            type: "string"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to GitLab"
          }
        }
      },
      output: {
        type: "object",
        properties: {
          remoteUrl: {
            title: "A URL to the repository with the provider",
            type: "string"
          },
          repoContentsUrl: {
            title: "A URL to the root of the repository",
            type: "string"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        repoVisibility = "private",
        defaultBranch = "master",
        gitCommitMessage = "initial commit",
        gitAuthorName,
        gitAuthorEmail
      } = ctx.input;
      const { owner, repo, host } = parseRepoUrl(repoUrl, integrations);
      if (!owner) {
        throw new errors.InputError(`No owner provided for host: ${host}, and repo ${repo}`);
      }
      const integrationConfig = integrations.gitlab.byHost(host);
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      if (!integrationConfig.config.token && !ctx.input.token) {
        throw new errors.InputError(`No token available for host ${host}`);
      }
      const token = ctx.input.token || integrationConfig.config.token;
      const tokenType = ctx.input.token ? "oauthToken" : "token";
      const client = new node.Gitlab({
        host: integrationConfig.config.baseUrl,
        [tokenType]: token
      });
      let { id: targetNamespace } = await client.Namespaces.show(owner);
      if (!targetNamespace) {
        const { id } = await client.Users.current();
        targetNamespace = id;
      }
      const { http_url_to_repo } = await client.Projects.create({
        namespace_id: targetNamespace,
        name: repo,
        visibility: repoVisibility
      });
      const remoteUrl = http_url_to_repo.replace(/\.git$/, "");
      const repoContentsUrl = `${remoteUrl}/-/blob/${defaultBranch}`;
      const gitAuthorInfo = {
        name: gitAuthorName ? gitAuthorName : config.getOptionalString("scaffolder.defaultAuthor.name"),
        email: gitAuthorEmail ? gitAuthorEmail : config.getOptionalString("scaffolder.defaultAuthor.email")
      };
      await initRepoAndPush({
        dir: getRepoSourceDirectory(ctx.workspacePath, ctx.input.sourcePath),
        remoteUrl: http_url_to_repo,
        defaultBranch,
        auth: {
          username: "oauth2",
          password: token
        },
        logger: ctx.logger,
        commitMessage: gitCommitMessage ? gitCommitMessage : config.getOptionalString("scaffolder.defaultCommitMessage"),
        gitAuthorInfo
      });
      ctx.output("remoteUrl", remoteUrl);
      ctx.output("repoContentsUrl", repoContentsUrl);
    }
  });
}

const createPublishGitlabMergeRequestAction = (options) => {
  const { integrations } = options;
  return createTemplateAction({
    id: "publish:gitlab:merge-request",
    schema: {
      input: {
        required: ["projectid", "repoUrl", "targetPath", "branchName"],
        type: "object",
        properties: {
          repoUrl: {
            type: "string",
            title: "Repository Location",
            description: `Accepts the format 'gitlab.com/group_name/project_name' where 'project_name' is the repository name and 'group_name' is a group or username`
          },
          projectid: {
            type: "string",
            title: "projectid",
            description: "Project ID/Name(slug) of the Gitlab Project"
          },
          title: {
            type: "string",
            title: "Merge Request Name",
            description: "The name for the merge request"
          },
          description: {
            type: "string",
            title: "Merge Request Description",
            description: "The description of the merge request"
          },
          branchName: {
            type: "string",
            title: "Destination Branch name",
            description: "The description of the merge request"
          },
          targetPath: {
            type: "string",
            title: "Repository Subdirectory",
            description: "Subdirectory of repository to apply changes to"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The token to use for authorization to GitLab"
          }
        }
      },
      output: {
        type: "object",
        properties: {
          projectid: {
            title: "Gitlab Project id/Name(slug)",
            type: "string"
          },
          mergeRequestURL: {
            title: "MergeRequest(MR) URL",
            type: "string",
            description: "Link to the merge request in GitLab"
          }
        }
      }
    },
    async handler(ctx) {
      var _a;
      const repoUrl = ctx.input.repoUrl;
      const { host } = parseRepoUrl(repoUrl, integrations);
      const integrationConfig = integrations.gitlab.byHost(host);
      const actions = [];
      const destinationBranch = ctx.input.branchName;
      if (!integrationConfig) {
        throw new errors.InputError(`No matching integration configuration for host ${host}, please check your integrations config`);
      }
      if (!integrationConfig.config.token && !ctx.input.token) {
        throw new errors.InputError(`No token available for host ${host}`);
      }
      const token = (_a = ctx.input.token) != null ? _a : integrationConfig.config.token;
      const tokenType = ctx.input.token ? "oauthToken" : "token";
      const api = new node.Gitlab({
        host: integrationConfig.config.baseUrl,
        [tokenType]: token
      });
      const fileRoot = ctx.workspacePath;
      const localFilePaths = await globby__default["default"]([`${ctx.input.targetPath}/**`], {
        cwd: fileRoot,
        gitignore: true,
        dot: true
      });
      const fileContents = await Promise.all(localFilePaths.map((p) => fs.readFile(backendCommon.resolveSafeChildPath(fileRoot, p))));
      const repoFilePaths = localFilePaths.map((repoFilePath) => {
        return repoFilePath;
      });
      for (let i = 0; i < repoFilePaths.length; i++) {
        actions.push({
          action: "create",
          filePath: repoFilePaths[i],
          content: fileContents[i].toString()
        });
      }
      const projects = await api.Projects.show(ctx.input.projectid);
      const { default_branch: defaultBranch } = projects;
      try {
        await api.Branches.create(ctx.input.projectid, destinationBranch, String(defaultBranch));
      } catch (e) {
        throw new errors.InputError(`The branch creation failed ${e}`);
      }
      try {
        await api.Commits.create(ctx.input.projectid, destinationBranch, ctx.input.title, actions);
      } catch (e) {
        throw new errors.InputError(`Committing the changes to ${destinationBranch} failed ${e}`);
      }
      try {
        const mergeRequestUrl = await api.MergeRequests.create(ctx.input.projectid, destinationBranch, String(defaultBranch), ctx.input.title, { description: ctx.input.description }).then((mergeRequest) => {
          return mergeRequest.web_url;
        });
        ctx.output("projectid", ctx.input.projectid);
        ctx.output("mergeRequestUrl", mergeRequestUrl);
      } catch (e) {
        throw new errors.InputError(`Merge request creation failed${e}`);
      }
    }
  });
};

function createGithubActionsDispatchAction(options) {
  const { integrations, githubCredentialsProvider } = options;
  return createTemplateAction({
    id: "github:actions:dispatch",
    description: "Dispatches a GitHub Action workflow for a given branch or tag",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl", "workflowId", "branchOrTagName"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the new repository name and 'owner' is an organization or username`,
            type: "string"
          },
          workflowId: {
            title: "Workflow ID",
            description: "The GitHub Action Workflow filename",
            type: "string"
          },
          branchOrTagName: {
            title: "Branch or Tag name",
            description: "The git branch or tag name used to dispatch the workflow",
            type: "string"
          },
          workflowInputs: {
            title: "Workflow Inputs",
            description: "Inputs keys and values to send to GitHub Action configured on the workflow file. The maximum number of properties is 10. ",
            type: "object"
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The GITHUB_TOKEN to use for authorization to GitHub"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        workflowId,
        branchOrTagName,
        workflowInputs,
        token: providedToken
      } = ctx.input;
      ctx.logger.info(`Dispatching workflow ${workflowId} for repo ${repoUrl} on ${branchOrTagName}`);
      const { owner, repo } = parseRepoUrl(repoUrl, integrations);
      if (!owner) {
        throw new errors.InputError("Invalid repository owner provided in repoUrl");
      }
      const client = new octokit.Octokit(await getOctokitOptions({
        integrations,
        repoUrl,
        credentialsProvider: githubCredentialsProvider,
        token: providedToken
      }));
      await client.rest.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref: branchOrTagName,
        inputs: workflowInputs
      });
      ctx.logger.info(`Workflow ${workflowId} dispatched successfully`);
    }
  });
}

function createGithubWebhookAction(options) {
  const { integrations, defaultWebhookSecret, githubCredentialsProvider } = options;
  const eventNames = webhooks.emitterEventNames.filter((event) => !event.includes("."));
  return createTemplateAction({
    id: "github:webhook",
    description: "Creates webhook for a repository on GitHub.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl", "webhookUrl"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the new repository name and 'owner' is an organization or username`,
            type: "string"
          },
          webhookUrl: {
            title: "Webhook URL",
            description: "The URL to which the payloads will be delivered",
            type: "string"
          },
          webhookSecret: {
            title: "Webhook Secret",
            description: "Webhook secret value. The default can be provided internally in action creation",
            type: "string"
          },
          events: {
            title: "Triggering Events",
            description: "Determines what events the hook is triggered for. Default: push",
            type: "array",
            oneOf: [
              {
                items: {
                  type: "string",
                  enum: eventNames
                }
              },
              {
                items: {
                  type: "string",
                  const: "*"
                }
              }
            ]
          },
          active: {
            title: "Active",
            type: "boolean",
            description: `Determines if notifications are sent when the webhook is triggered. Default: true`
          },
          contentType: {
            title: "Content Type",
            type: "string",
            enum: ["form", "json"],
            description: `The media type used to serialize the payloads. The default is 'form'`
          },
          insecureSsl: {
            title: "Insecure SSL",
            type: "boolean",
            description: `Determines whether the SSL certificate of the host for url will be verified when delivering payloads. Default 'false'`
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The GITHUB_TOKEN to use for authorization to GitHub"
          }
        }
      }
    },
    async handler(ctx) {
      const {
        repoUrl,
        webhookUrl,
        webhookSecret = defaultWebhookSecret,
        events = ["push"],
        active = true,
        contentType = "form",
        insecureSsl = false,
        token: providedToken
      } = ctx.input;
      ctx.logger.info(`Creating webhook ${webhookUrl} for repo ${repoUrl}`);
      const { owner, repo } = parseRepoUrl(repoUrl, integrations);
      if (!owner) {
        throw new errors.InputError("Invalid repository owner provided in repoUrl");
      }
      const client = new octokit.Octokit(await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        repoUrl,
        token: providedToken
      }));
      try {
        const insecure_ssl = insecureSsl ? "1" : "0";
        await client.rest.repos.createWebhook({
          owner,
          repo,
          config: {
            url: webhookUrl,
            content_type: contentType,
            secret: webhookSecret,
            insecure_ssl
          },
          events,
          active
        });
        ctx.logger.info(`Webhook '${webhookUrl}' created successfully`);
      } catch (e) {
        errors.assertError(e);
        ctx.logger.warn(`Failed: create webhook '${webhookUrl}' on repo: '${repo}', ${e.message}`);
      }
    }
  });
}

function createGithubIssuesLabelAction(options) {
  const { integrations, githubCredentialsProvider } = options;
  return createTemplateAction({
    id: "github:issues:label",
    description: "Adds labels to a pull request or issue on GitHub.",
    schema: {
      input: {
        type: "object",
        required: ["repoUrl", "number", "labels"],
        properties: {
          repoUrl: {
            title: "Repository Location",
            description: `Accepts the format 'github.com?repo=reponame&owner=owner' where 'reponame' is the repository name and 'owner' is an organization or username`,
            type: "string"
          },
          number: {
            title: "Pull Request or issue number",
            description: "The pull request or issue number to add labels to",
            type: "number"
          },
          labels: {
            title: "Labels",
            description: "The labels to add to the pull request or issue",
            type: "array",
            items: {
              type: "string"
            }
          },
          token: {
            title: "Authentication Token",
            type: "string",
            description: "The GITHUB_TOKEN to use for authorization to GitHub"
          }
        }
      }
    },
    async handler(ctx) {
      const { repoUrl, number, labels, token: providedToken } = ctx.input;
      const { owner, repo } = parseRepoUrl(repoUrl, integrations);
      ctx.logger.info(`Adding labels to ${number} issue on repo ${repo}`);
      if (!owner) {
        throw new errors.InputError("Invalid repository owner provided in repoUrl");
      }
      const client = new octokit.Octokit(await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        repoUrl,
        token: providedToken
      }));
      try {
        await client.rest.issues.addLabels({
          owner,
          repo,
          issue_number: number,
          labels
        });
      } catch (e) {
        errors.assertError(e);
        ctx.logger.warn(`Failed: adding labels to issue: '${number}' on repo: '${repo}', ${e.message}`);
      }
    }
  });
}

const createBuiltinActions = (options) => {
  const {
    reader,
    integrations,
    catalogClient,
    config,
    additionalTemplateFilters
  } = options;
  const githubCredentialsProvider = integration.DefaultGithubCredentialsProvider.fromIntegrations(integrations);
  const actions = [
    createFetchPlainAction({
      reader,
      integrations
    }),
    createFetchTemplateAction({
      integrations,
      reader,
      additionalTemplateFilters
    }),
    createPublishGithubAction({
      integrations,
      config,
      githubCredentialsProvider
    }),
    createPublishGithubTemplateAction({
      integrations,
      config,
      githubCredentialsProvider
    }),
    createPublishGithubPullRequestAction({
      integrations,
      githubCredentialsProvider
    }),
    createPublishGitlabAction({
      integrations,
      config
    }),
    createPublishGitlabMergeRequestAction({
      integrations
    }),
    createPublishBitbucketAction({
      integrations,
      config
    }),
    createPublishBitbucketCloudAction({
      integrations,
      config
    }),
    createPublishBitbucketServerAction({
      integrations,
      config
    }),
    createPublishAzureAction({
      integrations,
      config
    }),
    createDebugLogAction(),
    createCatalogRegisterAction({ catalogClient, integrations }),
    createCatalogWriteAction(),
    createFilesystemDeleteAction(),
    createFilesystemRenameAction(),
    createGithubActionsDispatchAction({
      integrations,
      githubCredentialsProvider
    }),
    createGithubWebhookAction({
      integrations,
      githubCredentialsProvider
    }),
    createGithubIssuesLabelAction({
      integrations,
      githubCredentialsProvider
    })
  ];
  return actions;
};

class TemplateActionRegistry {
  constructor() {
    this.actions = /* @__PURE__ */ new Map();
  }
  register(action) {
    if (this.actions.has(action.id)) {
      throw new errors.ConflictError(`Template action with ID '${action.id}' has already been registered`);
    }
    this.actions.set(action.id, action);
  }
  get(actionId) {
    const action = this.actions.get(actionId);
    if (!action) {
      this.actions.forEach((value, key) => {
        console.log(key, value);
      });
      throw new errors.NotFoundError(`Template action with ID '${actionId}' is not registered: test`);
    }
    return action;
  }
  list() {
    return [...this.actions.values()];
  }
}

const migrationsDir = backendCommon.resolvePackagePath("@backstage/plugin-scaffolder-backend", "migrations");
class DatabaseTaskStore {
  static async create(options) {
    await options.database.migrate.latest({
      directory: migrationsDir
    });
    return new DatabaseTaskStore(options);
  }
  constructor(options) {
    this.db = options.database;
  }
  async getTask(taskId) {
    var _a;
    const [result] = await this.db("tasks").where({ id: taskId }).select();
    if (!result) {
      throw new errors.NotFoundError(`No task with id '${taskId}' found`);
    }
    try {
      const spec = JSON.parse(result.spec);
      const secrets = result.secrets ? JSON.parse(result.secrets) : void 0;
      return {
        id: result.id,
        spec,
        status: result.status,
        lastHeartbeatAt: result.last_heartbeat_at,
        createdAt: result.created_at,
        createdBy: (_a = result.created_by) != null ? _a : void 0,
        secrets
      };
    } catch (error) {
      throw new Error(`Failed to parse spec of task '${taskId}', ${error}`);
    }
  }
  async createTask(options) {
    var _a;
    const taskId = uuid.v4();
    await this.db("tasks").insert({
      id: taskId,
      spec: JSON.stringify(options.spec),
      secrets: options.secrets ? JSON.stringify(options.secrets) : void 0,
      created_by: (_a = options.createdBy) != null ? _a : null,
      status: "open"
    });
    return { taskId };
  }
  async claimTask() {
    return this.db.transaction(async (tx) => {
      var _a;
      const [task] = await tx("tasks").where({
        status: "open"
      }).limit(1).select();
      if (!task) {
        return void 0;
      }
      const updateCount = await tx("tasks").where({ id: task.id, status: "open" }).update({
        status: "processing",
        last_heartbeat_at: this.db.fn.now(),
        secrets: null
      });
      if (updateCount < 1) {
        return void 0;
      }
      try {
        const spec = JSON.parse(task.spec);
        const secrets = task.secrets ? JSON.parse(task.secrets) : void 0;
        return {
          id: task.id,
          spec,
          status: "processing",
          lastHeartbeatAt: task.last_heartbeat_at,
          createdAt: task.created_at,
          createdBy: (_a = task.created_by) != null ? _a : void 0,
          secrets
        };
      } catch (error) {
        throw new Error(`Failed to parse spec of task '${task.id}', ${error}`);
      }
    });
  }
  async heartbeatTask(taskId) {
    const updateCount = await this.db("tasks").where({ id: taskId, status: "processing" }).update({
      last_heartbeat_at: this.db.fn.now()
    });
    if (updateCount === 0) {
      throw new errors.ConflictError(`No running task with taskId ${taskId} found`);
    }
  }
  async listStaleTasks({ timeoutS }) {
    const rawRows = await this.db("tasks").where("status", "processing").andWhere("last_heartbeat_at", "<=", this.db.client.config.client.includes("sqlite3") ? this.db.raw(`datetime('now', ?)`, [`-${timeoutS} seconds`]) : this.db.raw(`dateadd('second', ?, ?)`, [
      `-${timeoutS}`,
      this.db.fn.now()
    ]));
    const tasks = rawRows.map((row) => ({
      taskId: row.id
    }));
    return { tasks };
  }
  async completeTask({
    taskId,
    status,
    eventBody
  }) {
    let oldStatus;
    if (status === "failed" || status === "completed") {
      oldStatus = "processing";
    } else {
      throw new Error(`Invalid status update of run '${taskId}' to status '${status}'`);
    }
    await this.db.transaction(async (tx) => {
      const [task] = await tx("tasks").where({
        id: taskId
      }).limit(1).select();
      if (!task) {
        throw new Error(`No task with taskId ${taskId} found`);
      }
      if (task.status !== oldStatus) {
        throw new errors.ConflictError(`Refusing to update status of run '${taskId}' to status '${status}' as it is currently '${task.status}', expected '${oldStatus}'`);
      }
      const updateCount = await tx("tasks").where({
        id: taskId,
        status: oldStatus
      }).update({
        status
      });
      if (updateCount !== 1) {
        throw new errors.ConflictError(`Failed to update status to '${status}' for taskId ${taskId}`);
      }
      await tx("task_events").insert({
        task_id: taskId,
        event_type: "completion",
        body: JSON.stringify(eventBody)
      });
    });
  }
  async emitLogEvent(options) {
    const { taskId, body } = options;
    const serializedBody = JSON.stringify(body);
    await this.db("task_events").insert({
      task_id: taskId,
      event_type: "log",
      body: serializedBody
    });
  }
  async listEvents({
    taskId,
    after
  }) {
    const rawEvents = await this.db("task_events").where({
      task_id: taskId
    }).andWhere((builder) => {
      if (typeof after === "number") {
        builder.where("id", ">", after).orWhere("event_type", "completion");
      }
    }).orderBy("id").select();
    const events = rawEvents.map((event) => {
      try {
        const body = JSON.parse(event.body);
        return {
          id: Number(event.id),
          taskId,
          body,
          type: event.event_type,
          createdAt: typeof event.created_at === "string" ? luxon.DateTime.fromSQL(event.created_at, { zone: "UTC" }).toISO() : event.created_at
        };
      } catch (error) {
        throw new Error(`Failed to parse event body from event taskId=${taskId} id=${event.id}, ${error}`);
      }
    });
    return { events };
  }
}

class TaskManager {
  constructor(task, storage, logger) {
    this.task = task;
    this.storage = storage;
    this.logger = logger;
    this.isDone = false;
  }
  static create(task, storage, logger) {
    const agent = new TaskManager(task, storage, logger);
    agent.startTimeout();
    return agent;
  }
  get spec() {
    return this.task.spec;
  }
  get secrets() {
    return this.task.secrets;
  }
  get createdBy() {
    return this.task.createdBy;
  }
  async getWorkspaceName() {
    return this.task.taskId;
  }
  get done() {
    return this.isDone;
  }
  async emitLog(message, logMetadata) {
    await this.storage.emitLogEvent({
      taskId: this.task.taskId,
      body: { message, ...logMetadata }
    });
  }
  async complete(result, metadata) {
    await this.storage.completeTask({
      taskId: this.task.taskId,
      status: result === "failed" ? "failed" : "completed",
      eventBody: {
        message: `Run completed with status: ${result}`,
        ...metadata
      }
    });
    this.isDone = true;
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
    }
  }
  startTimeout() {
    this.heartbeatTimeoutId = setTimeout(async () => {
      try {
        await this.storage.heartbeatTask(this.task.taskId);
        this.startTimeout();
      } catch (error) {
        this.isDone = true;
        this.logger.error(`Heartbeat for task ${this.task.taskId} failed`, error);
      }
    }, 1e3);
  }
}
function defer() {
  let resolve = () => {
  };
  const promise = new Promise((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}
class StorageTaskBroker {
  constructor(storage, logger) {
    this.storage = storage;
    this.logger = logger;
    this.deferredDispatch = defer();
  }
  async claim() {
    for (; ; ) {
      const pendingTask = await this.storage.claimTask();
      if (pendingTask) {
        return TaskManager.create({
          taskId: pendingTask.id,
          spec: pendingTask.spec,
          secrets: pendingTask.secrets,
          createdBy: pendingTask.createdBy
        }, this.storage, this.logger);
      }
      await this.waitForDispatch();
    }
  }
  async dispatch(options) {
    const taskRow = await this.storage.createTask(options);
    this.signalDispatch();
    return {
      taskId: taskRow.taskId
    };
  }
  async get(taskId) {
    return this.storage.getTask(taskId);
  }
  event$(options) {
    return new ObservableImpl__default["default"]((observer) => {
      const { taskId } = options;
      let after = options.after;
      let cancelled = false;
      (async () => {
        while (!cancelled) {
          const result = await this.storage.listEvents({ taskId, after });
          const { events } = result;
          if (events.length) {
            after = events[events.length - 1].id;
            observer.next(result);
          }
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      })();
      return () => {
        cancelled = true;
      };
    });
  }
  async vacuumTasks(options) {
    const { tasks } = await this.storage.listStaleTasks(options);
    await Promise.all(tasks.map(async (task) => {
      try {
        await this.storage.completeTask({
          taskId: task.taskId,
          status: "failed",
          eventBody: {
            message: "The task was cancelled because the task worker lost connection to the task broker"
          }
        });
      } catch (error) {
        this.logger.warn(`Failed to cancel task '${task.taskId}', ${error}`);
      }
    }));
  }
  waitForDispatch() {
    return this.deferredDispatch.promise;
  }
  signalDispatch() {
    this.deferredDispatch.resolve();
    this.deferredDispatch = defer();
  }
}

function isTruthy(value) {
  return lodash.isArray(value) ? value.length > 0 : !!value;
}

const isValidTaskSpec = (taskSpec) => {
  return taskSpec.apiVersion === "scaffolder.backstage.io/v1beta3";
};
const createStepLogger = ({
  task,
  step
}) => {
  const metadata = { stepId: step.id };
  const taskLogger = winston__namespace.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston__namespace.format.combine(winston__namespace.format.colorize(), winston__namespace.format.timestamp(), winston__namespace.format.simple()),
    defaultMeta: {}
  });
  const streamLogger = new stream.PassThrough();
  streamLogger.on("data", async (data) => {
    const message = data.toString().trim();
    if ((message == null ? void 0 : message.length) > 1) {
      await task.emitLog(message, metadata);
    }
  });
  taskLogger.add(new winston__namespace.transports.Stream({ stream: streamLogger }));
  return { taskLogger, streamLogger };
};
class NunjucksWorkflowRunner {
  constructor(options) {
    this.options = options;
  }
  isSingleTemplateString(input) {
    var _a, _b;
    const { parser, nodes } = nunjucks__default["default"];
    const parsed = parser.parse(input, {}, {
      autoescape: false,
      tags: {
        variableStart: "${{",
        variableEnd: "}}"
      }
    });
    return parsed.children.length === 1 && !(((_b = (_a = parsed.children[0]) == null ? void 0 : _a.children) == null ? void 0 : _b[0]) instanceof nodes.TemplateData);
  }
  render(input, context, renderTemplate) {
    return JSON.parse(JSON.stringify(input), (_key, value) => {
      try {
        if (typeof value === "string") {
          try {
            if (this.isSingleTemplateString(value)) {
              const wrappedDumped = value.replace(/\${{(.+)}}/g, "${{ ( $1 ) | dump }}");
              const templated2 = renderTemplate(wrappedDumped, context);
              if (templated2 === "") {
                return void 0;
              }
              return JSON.parse(templated2);
            }
          } catch (ex) {
            this.options.logger.error(`Failed to parse template string: ${value} with error ${ex.message}`);
          }
          const templated = renderTemplate(value, context);
          if (templated === "") {
            return void 0;
          }
          return templated;
        }
      } catch {
        return value;
      }
      return value;
    });
  }
  async execute(task) {
    var _a, _b, _c, _d;
    if (!isValidTaskSpec(task.spec)) {
      throw new errors.InputError("Wrong template version executed with the workflow engine");
    }
    const workspacePath = path__default["default"].join(this.options.workingDirectory, await task.getWorkspaceName());
    const { integrations } = this.options;
    const renderTemplate = await SecureTemplater.loadRenderer({
      parseRepoUrl(url) {
        return parseRepoUrl(url, integrations);
      },
      additionalTemplateFilters: this.options.additionalTemplateFilters
    });
    try {
      await fs__default["default"].ensureDir(workspacePath);
      await task.emitLog(`Starting up task with ${task.spec.steps.length} steps`);
      const context = {
        parameters: task.spec.parameters,
        steps: {},
        user: task.spec.user
      };
      for (const step of task.spec.steps) {
        try {
          if (step.if) {
            const ifResult = await this.render(step.if, context, renderTemplate);
            if (!isTruthy(ifResult)) {
              await task.emitLog(`Skipping step ${step.id} because it's if condition was false`, { stepId: step.id, status: "skipped" });
              continue;
            }
          }
          await task.emitLog(`Beginning step ${step.name}`, {
            stepId: step.id,
            status: "processing"
          });
          const action = this.options.actionRegistry.get(step.action);
          const { taskLogger, streamLogger } = createStepLogger({ task, step });
          const input = (_b = step.input && this.render(step.input, { ...context, secrets: (_a = task.secrets) != null ? _a : {} }, renderTemplate)) != null ? _b : {};
          if ((_c = action.schema) == null ? void 0 : _c.input) {
            const validateResult = jsonschema.validate(input, action.schema.input);
            if (!validateResult.valid) {
              const errors$1 = validateResult.errors.join(", ");
              throw new errors.InputError(`Invalid input passed to action ${action.id}, ${errors$1}`);
            }
          }
          const tmpDirs = new Array();
          const stepOutput = {};
          await action.handler({
            input,
            secrets: (_d = task.secrets) != null ? _d : {},
            logger: taskLogger,
            logStream: streamLogger,
            workspacePath,
            createTemporaryDirectory: async () => {
              const tmpDir = await fs__default["default"].mkdtemp(`${workspacePath}_step-${step.id}-`);
              tmpDirs.push(tmpDir);
              return tmpDir;
            },
            output(name, value) {
              stepOutput[name] = value;
            },
            templateInfo: task.spec.templateInfo
          });
          for (const tmpDir of tmpDirs) {
            await fs__default["default"].remove(tmpDir);
          }
          context.steps[step.id] = { output: stepOutput };
          await task.emitLog(`Finished step ${step.name}`, {
            stepId: step.id,
            status: "completed"
          });
        } catch (err) {
          await task.emitLog(String(err.stack), {
            stepId: step.id,
            status: "failed"
          });
          throw err;
        }
      }
      const output = this.render(task.spec.output, context, renderTemplate);
      return { output };
    } finally {
      if (workspacePath) {
        await fs__default["default"].remove(workspacePath);
      }
    }
  }
}

class TaskWorker {
  constructor(options) {
    this.options = options;
  }
  static async create(options) {
    const {
      taskBroker,
      logger,
      actionRegistry,
      integrations,
      workingDirectory,
      additionalTemplateFilters
    } = options;
    const workflowRunner = new NunjucksWorkflowRunner({
      actionRegistry,
      integrations,
      logger,
      workingDirectory,
      additionalTemplateFilters
    });
    return new TaskWorker({
      taskBroker,
      runners: { workflowRunner }
    });
  }
  start() {
    (async () => {
      for (; ; ) {
        const task = await this.options.taskBroker.claim();
        await this.runOneTask(task);
      }
    })();
  }
  async runOneTask(task) {
    try {
      if (task.spec.apiVersion !== "scaffolder.backstage.io/v1beta3") {
        throw new Error(`Unsupported Template apiVersion ${task.spec.apiVersion}`);
      }
      const { output } = await this.options.runners.workflowRunner.execute(task);
      await task.complete("completed", { output });
    } catch (error) {
      errors.assertError(error);
      await task.complete("failed", {
        error: { name: error.name, message: error.message }
      });
    }
  }
}

async function getWorkingDirectory(config, logger) {
  if (!config.has("backend.workingDirectory")) {
    return os__default["default"].tmpdir();
  }
  const workingDirectory = config.getString("backend.workingDirectory");
  try {
    await fs__default["default"].access(workingDirectory, fs__default["default"].constants.F_OK | fs__default["default"].constants.W_OK);
    logger.info(`using working directory: ${workingDirectory}`);
  } catch (err) {
    errors.assertError(err);
    logger.error(`working directory ${workingDirectory} ${err.code === "ENOENT" ? "does not exist" : "is not writable"}`);
    throw err;
  }
  return workingDirectory;
}
function getEntityBaseUrl(entity) {
  var _a, _b;
  let location = (_a = entity.metadata.annotations) == null ? void 0 : _a[catalogModel.ANNOTATION_SOURCE_LOCATION];
  if (!location) {
    location = (_b = entity.metadata.annotations) == null ? void 0 : _b[catalogModel.ANNOTATION_LOCATION];
  }
  if (!location) {
    return void 0;
  }
  const { type, target } = catalogModel.parseLocationRef(location);
  if (type === "url") {
    return target;
  } else if (type === "file") {
    return `file://${target}`;
  }
  return void 0;
}
async function findTemplate(options) {
  const { entityRef, token, catalogApi } = options;
  if (entityRef.namespace.toLocaleLowerCase("en-US") !== catalogModel.DEFAULT_NAMESPACE) {
    throw new errors.InputError(`Invalid namespace, only '${catalogModel.DEFAULT_NAMESPACE}' namespace is supported`);
  }
  if (entityRef.kind.toLocaleLowerCase("en-US") !== "template") {
    throw new errors.InputError(`Invalid kind, only 'Template' kind is supported`);
  }
  const template = await catalogApi.getEntityByRef(entityRef, { token });
  if (!template) {
    throw new errors.NotFoundError(`Template ${catalogModel.stringifyEntityRef(entityRef)} not found`);
  }
  return template;
}

function isSupportedTemplate(entity) {
  return entity.apiVersion === "scaffolder.backstage.io/v1beta3";
}
async function createRouter(options) {
  const router = Router__default["default"]();
  router.use(express__default["default"].json());
  const {
    logger: parentLogger,
    config,
    reader,
    database,
    catalogClient,
    actions,
    taskWorkers,
    additionalTemplateFilters
  } = options;
  const logger = parentLogger.child({ plugin: "scaffolder" });
  const workingDirectory = await getWorkingDirectory(config, logger);
  const integrations = integration.ScmIntegrations.fromConfig(config);
  let taskBroker;
  if (!options.taskBroker) {
    const databaseTaskStore = await DatabaseTaskStore.create({
      database: await database.getClient()
    });
    taskBroker = new StorageTaskBroker(databaseTaskStore, logger);
  } else {
    taskBroker = options.taskBroker;
  }
  const actionRegistry = new TemplateActionRegistry();
  const workers = [];
  for (let i = 0; i < (taskWorkers || 1); i++) {
    const worker = await TaskWorker.create({
      taskBroker,
      actionRegistry,
      integrations,
      logger,
      workingDirectory,
      additionalTemplateFilters
    });
    workers.push(worker);
  }
  const actionsToRegister = Array.isArray(actions) ? actions : createBuiltinActions({
    integrations,
    catalogClient,
    reader,
    config,
    additionalTemplateFilters
  });
  actionsToRegister.forEach((action) => actionRegistry.register(action));
  workers.forEach((worker) => worker.start());
  router.get("/v2/templates/:namespace/:kind/:name/parameter-schema", async (req, res) => {
    var _a, _b;
    const { namespace, kind, name } = req.params;
    const { token } = parseBearerToken(req.headers.authorization);
    const template = await findTemplate({
      catalogApi: catalogClient,
      entityRef: { kind, namespace, name },
      token
    });
    if (isSupportedTemplate(template)) {
      const parameters = [(_a = template.spec.parameters) != null ? _a : []].flat();
      res.json({
        title: (_b = template.metadata.title) != null ? _b : template.metadata.name,
        steps: parameters.map((schema) => {
          var _a2;
          return {
            title: (_a2 = schema.title) != null ? _a2 : "Fill in template parameters",
            schema
          };
        })
      });
    } else {
      throw new errors.InputError(`Unsupported apiVersion field in schema entity, ${template.apiVersion}`);
    }
  }).get("/v2/actions", async (_req, res) => {
    const actionsList = actionRegistry.list().map((action) => {
      return {
        id: action.id,
        description: action.description,
        schema: action.schema
      };
    });
    res.json(actionsList);
  }).post("/v2/tasks", async (req, res) => {
    var _a, _b, _c;
    const templateRef = req.body.templateRef;
    const { kind, namespace, name } = catalogModel.parseEntityRef(templateRef, {
      defaultKind: "template"
    });
    const { token, entityRef: userEntityRef } = parseBearerToken(req.headers.authorization);
    const userEntity = userEntityRef ? await catalogClient.getEntityByRef(userEntityRef, { token }) : void 0;
    const values = req.body.values;
    const template = await findTemplate({
      catalogApi: catalogClient,
      entityRef: { kind, namespace, name },
      token
    });
    if (!isSupportedTemplate(template)) {
      throw new errors.InputError(`Unsupported apiVersion field in schema entity, ${template.apiVersion}`);
    }
    for (const parameters of [(_a = template.spec.parameters) != null ? _a : []].flat()) {
      const result2 = jsonschema.validate(values, parameters);
      if (!result2.valid) {
        res.status(400).json({ errors: result2.errors });
        return;
      }
    }
    const baseUrl = getEntityBaseUrl(template);
    const taskSpec = {
      apiVersion: template.apiVersion,
      steps: template.spec.steps.map((step, index) => {
        var _a2, _b2;
        return {
          ...step,
          id: (_a2 = step.id) != null ? _a2 : `step-${index + 1}`,
          name: (_b2 = step.name) != null ? _b2 : step.action
        };
      }),
      output: (_b = template.spec.output) != null ? _b : {},
      parameters: values,
      user: {
        entity: userEntity,
        ref: userEntityRef
      },
      templateInfo: {
        entityRef: catalogModel.stringifyEntityRef({
          kind,
          namespace,
          name: (_c = template.metadata) == null ? void 0 : _c.name
        }),
        baseUrl
      }
    };
    const result = await taskBroker.dispatch({
      spec: taskSpec,
      createdBy: userEntityRef,
      secrets: {
        ...req.body.secrets,
        backstageToken: token
      }
    });
    res.status(201).json({ id: result.taskId });
  }).get("/v2/tasks/:taskId", async (req, res) => {
    const { taskId } = req.params;
    const task = await taskBroker.get(taskId);
    if (!task) {
      throw new errors.NotFoundError(`Task with id ${taskId} does not exist`);
    }
    delete task.secrets;
    res.status(200).json(task);
  }).get("/v2/tasks/:taskId/eventstream", async (req, res) => {
    const { taskId } = req.params;
    const after = req.query.after !== void 0 ? Number(req.query.after) : void 0;
    logger.debug(`Event stream observing taskId '${taskId}' opened`);
    res.writeHead(200, {
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream"
    });
    const subscription = taskBroker.event$({ taskId, after }).subscribe({
      error: (error) => {
        logger.error(`Received error from event stream when observing taskId '${taskId}', ${error}`);
      },
      next: ({ events }) => {
        var _a;
        let shouldUnsubscribe = false;
        for (const event of events) {
          res.write(`event: ${event.type}
data: ${JSON.stringify(event)}

`);
          if (event.type === "completion") {
            shouldUnsubscribe = true;
          }
        }
        (_a = res.flush) == null ? void 0 : _a.call(res);
        if (shouldUnsubscribe)
          subscription.unsubscribe();
      }
    });
    req.on("close", () => {
      subscription.unsubscribe();
      logger.debug(`Event stream observing taskId '${taskId}' closed`);
    });
  }).get("/v2/tasks/:taskId/events", async (req, res) => {
    const { taskId } = req.params;
    const after = Number(req.query.after) || void 0;
    const timeout = setTimeout(() => {
      res.json([]);
    }, 3e4);
    const subscription = taskBroker.event$({ taskId, after }).subscribe({
      error: (error) => {
        logger.error(`Received error from event stream when observing taskId '${taskId}', ${error}`);
      },
      next: ({ events }) => {
        clearTimeout(timeout);
        subscription.unsubscribe();
        res.json(events);
      }
    });
    req.on("close", () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    });
  });
  const app = express__default["default"]();
  app.set("logger", logger);
  app.use("/", router);
  return app;
}
function parseBearerToken(header) {
  var _a;
  const token = (_a = header == null ? void 0 : header.match(/Bearer\s+(\S+)/i)) == null ? void 0 : _a[1];
  if (!token)
    return {};
  const [_header, rawPayload, _signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(rawPayload, "base64").toString());
  return {
    entityRef: payload.sub,
    token
  };
}

class ScaffolderEntitiesProcessor {
  constructor() {
    this.validators = [pluginScaffolderCommon.templateEntityV1beta3Validator];
  }
  getProcessorName() {
    return "ScaffolderEntitiesProcessor";
  }
  async validateEntityKind(entity) {
    for (const validator of this.validators) {
      if (await validator.check(entity)) {
        return true;
      }
    }
    return false;
  }
  async postProcessEntity(entity, _location, emit) {
    const selfRef = catalogModel.getCompoundEntityRef(entity);
    if (entity.apiVersion === "scaffolder.backstage.io/v1beta3" && entity.kind === "Template") {
      const template = entity;
      const target = template.spec.owner;
      if (target) {
        const targetRef = catalogModel.parseEntityRef(target, {
          defaultKind: "Group",
          defaultNamespace: selfRef.namespace
        });
        emit(pluginCatalogBackend.processingResult.relation({
          source: selfRef,
          type: catalogModel.RELATION_OWNED_BY,
          target: {
            kind: targetRef.kind,
            namespace: targetRef.namespace,
            name: targetRef.name
          }
        }));
        emit(pluginCatalogBackend.processingResult.relation({
          source: {
            kind: targetRef.kind,
            namespace: targetRef.namespace,
            name: targetRef.name
          },
          type: catalogModel.RELATION_OWNER_OF,
          target: selfRef
        }));
      }
    }
    return entity;
  }
}

exports.DatabaseTaskStore = DatabaseTaskStore;
exports.ScaffolderEntitiesProcessor = ScaffolderEntitiesProcessor;
exports.TaskManager = TaskManager;
exports.TaskWorker = TaskWorker;
exports.TemplateActionRegistry = TemplateActionRegistry;
exports.createBuiltinActions = createBuiltinActions;
exports.createCatalogRegisterAction = createCatalogRegisterAction;
exports.createCatalogWriteAction = createCatalogWriteAction;
exports.createDebugLogAction = createDebugLogAction;
exports.createFetchPlainAction = createFetchPlainAction;
exports.createFetchTemplateAction = createFetchTemplateAction;
exports.createFilesystemDeleteAction = createFilesystemDeleteAction;
exports.createFilesystemRenameAction = createFilesystemRenameAction;
exports.createGithubActionsDispatchAction = createGithubActionsDispatchAction;
exports.createGithubIssuesLabelAction = createGithubIssuesLabelAction;
exports.createGithubWebhookAction = createGithubWebhookAction;
exports.createPublishAzureAction = createPublishAzureAction;
exports.createPublishBitbucketAction = createPublishBitbucketAction;
exports.createPublishBitbucketCloudAction = createPublishBitbucketCloudAction;
exports.createPublishBitbucketServerAction = createPublishBitbucketServerAction;
exports.createPublishFileAction = createPublishFileAction;
exports.createPublishGithubAction = createPublishGithubAction;
exports.createPublishGithubPullRequestAction = createPublishGithubPullRequestAction;
exports.createPublishGithubTemplateAction = createPublishGithubTemplateAction;
exports.createPublishGitlabAction = createPublishGitlabAction;
exports.createPublishGitlabMergeRequestAction = createPublishGitlabMergeRequestAction;
exports.createRouter = createRouter;
exports.createTemplateAction = createTemplateAction;
exports.executeShellCommand = executeShellCommand;
exports.fetchContents = fetchContents;
//# sourceMappingURL=index.cjs.js.map

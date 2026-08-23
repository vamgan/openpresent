import { Command, Option } from 'commander';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild, createServer, type InlineConfig } from 'vite';
import { startStudio, type StudioServer } from '@openpresent/studio';
import { installSkill, listSkills, resolveSkill } from '@openpresent/skills';
import { validateTarget, type Diagnostic, type RuleId, type ValidatorConfig } from '@openpresent/validator';

// Read from the manifest rather than restating it. A literal here drifts
// silently every time the release script bumps package.json, which is how
// `--version` came to report 0.1.0 from a 0.3.2 install. `../package.json`
// resolves to this package from both src/ and the built dist/.
export const VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

function isDirectoryEmpty(path: string) {
  return !existsSync(path) || readdirSync(path).length === 0;
}

function copyTextTemplate(source: string, target: string, replacements: Record<string, string>) {
  mkdirSync(dirname(target), { recursive: true });
  if (statSync(source).isDirectory()) {
    for (const name of readdirSync(source)) copyTextTemplate(join(source, name), join(target, name), replacements);
    return;
  }
  let contents = readFileSync(source, 'utf8');
  for (const [key, value] of Object.entries(replacements)) contents = contents.replaceAll(key, value);
  writeFileSync(target, contents);
}

function safePackageName(directory: string) {
  return basename(resolve(directory)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'openpresent-deck';
}

function packageRoot(name: string) {
  const entry = fileURLToPath(import.meta.resolve(name));
  const dist = dirname(entry);
  return basename(dist) === 'dist' ? dirname(dist) : dist;
}

function vendorPackage(target: string, name: '@openpresent/core' | '@openpresent/components' | '@openpresent/validator') {
  const sourceRoot = packageRoot(name);
  const sourceDist = join(sourceRoot, 'dist');
  if (!existsSync(sourceDist)) {
    throw new Error(`${name} has not been built. Run "pnpm build" in the OpenPresent repository and retry.`);
  }
  const packageTarget = join(target, 'vendor', '@openpresent', name.split('/')[1]);
  mkdirSync(packageTarget, { recursive: true });
  cpSync(sourceDist, join(packageTarget, 'dist'), { recursive: true });
  const isComponents = name.endsWith('/components');
  const isValidator = name.endsWith('/validator');
  const manifest: Record<string, unknown> = {
    name,
    version: VERSION,
    type: 'module',
    main: './dist/index.js',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
    },
  };
  if (!isValidator) {
    manifest.sideEffects = ['**/*.css'];
    manifest.exports = {
      '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
      './styles.css': './dist/styles.css',
    };
    manifest.peerDependencies = { react: '>=18.2', 'react-dom': '>=18.2' };
  }
  manifest.dependencies = isValidator
    ? { typescript: '^5.9.2' }
    : isComponents
      ? { '@openpresent/core': 'file:../core', motion: '^12.23.12' }
      : { motion: '^12.23.12' };
  writeFileSync(join(packageTarget, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export interface CreateOptions { force?: boolean; skill?: string }

export function createStarter(directory: string, options: CreateOptions = {}) {
  const target = resolve(directory);
  if (options.skill) resolveSkill(options.skill);
  if (existsSync(target) && !isDirectoryEmpty(target) && !options.force) {
    throw new Error(`Refusing to overwrite non-empty directory: ${target}. Re-run with --force to replace starter files.`);
  }
  mkdirSync(target, { recursive: true });
  const templateRoot = fileURLToPath(new URL('../templates/starter', import.meta.url));
  if (!existsSync(templateRoot)) throw new Error(`OpenPresent starter template is missing at ${templateRoot}.`);
  copyTextTemplate(templateRoot, target, { '__PROJECT_NAME__': safePackageName(directory) });
  vendorPackage(target, '@openpresent/core');
  vendorPackage(target, '@openpresent/components');
  vendorPackage(target, '@openpresent/validator');
  if (options.skill) installSkill(options.skill, join(target, '.agents', 'skills'), { force: options.force });
  return target;
}

function findProjectRoot(entry?: string) {
  let current = resolve(entry ?? process.cwd());
  if (existsSync(current) && statSync(current).isFile()) current = dirname(current);
  while (true) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'index.html'))) return realpathSync(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not find a deck project for "${entry ?? process.cwd()}". Expected package.json and index.html.`);
}

export interface DevOptions { host?: string; port?: number; open?: boolean }

export async function startDevServer(entry: string | undefined, options: DevOptions = {}) {
  const root = findProjectRoot(entry);
  const server = await createServer({
    root,
    clearScreen: false,
    optimizeDeps: { entries: ['src/main.tsx'] },
    server: { host: options.host ?? '127.0.0.1', port: options.port ?? 5173, open: options.open },
  });
  await server.listen();
  server.printUrls();
  return server;
}

export interface BuildOptions { outDir?: string; sourcemap?: boolean }

export async function buildDeck(entry: string | undefined, options: BuildOptions = {}) {
  const root = findProjectRoot(entry);
  const outDir = resolve(root, options.outDir ?? 'dist');
  const config: InlineConfig = {
    root,
    base: './',
    clearScreen: false,
    build: { outDir, emptyOutDir: true, sourcemap: options.sourcemap ?? false },
  };
  try {
    await viteBuild(config);
  } catch (error) {
    throw new Error(`Static build failed for ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!existsSync(join(outDir, 'index.html'))) throw new Error(`Vite completed without producing ${join(outDir, 'index.html')}.`);
  return outDir;
}

export interface StudioOptions { studioPort?: number; previewPort?: number; open?: boolean; create?: boolean; skill?: string }

export async function startAuthoringStudio(entry: string | undefined, options: StudioOptions = {}): Promise<StudioServer> {
  if (options.create && !entry) throw new Error('openpresent studio --create requires an explicit empty target directory.');
  const root = options.create ? resolve(entry!) : findProjectRoot(entry);
  const entryPath = !options.create && entry && existsSync(resolve(entry)) && statSync(resolve(entry)).isFile() ? resolve(entry) : undefined;
  const mcpEntry = fileURLToPath(import.meta.resolve('@openpresent/mcp'));
  return startStudio({
    projectRoot: root,
    entry: entryPath,
    studioPort: options.studioPort,
    previewPort: options.previewPort,
    open: options.open,
    create: options.create,
    skill: options.skill,
    mcpCommand: process.execPath,
    mcpArgs: [mcpEntry],
  });
}

function formatDiagnostic(diagnostic: Diagnostic) {
  const location = diagnostic.slideId ? ` [${diagnostic.slideId}]` : '';
  return `${diagnostic.severity.toUpperCase()} ${diagnostic.ruleId}${location}\n  ${diagnostic.message}\n  Fix: ${diagnostic.hint}`;
}

function parseConfig(path?: string): Partial<ValidatorConfig> {
  if (!path) return {};
  const absolute = resolve(path);
  try { return JSON.parse(readFileSync(absolute, 'utf8')) as Partial<ValidatorConfig>; }
  catch (error) { throw new Error(`Could not read validator config ${absolute}: ${error instanceof Error ? error.message : String(error)}`); }
}

interface ValidateOptions {
  config?: string;
  json?: boolean;
  minFontSize?: number;
  maxElements?: number;
  viewport?: string;
  viewportPadding?: number;
  disable?: string[];
  warningsAsErrors?: boolean;
}

export async function runValidation(target: string, options: ValidateOptions = {}) {
  const fileConfig = parseConfig(options.config);
  const viewportMatch = options.viewport?.match(/^(\d+)x(\d+)$/i);
  if (options.viewport && !viewportMatch) throw new Error('Viewport must use WIDTHxHEIGHT, for example 1440x900.');
  const config = {
    ...fileConfig,
    ...(options.minFontSize ? { minFontSize: options.minFontSize } : {}),
    ...(options.maxElements ? { maxElementsPerSlide: options.maxElements } : {}),
    ...(viewportMatch ? { viewportWidth: Number(viewportMatch[1]), viewportHeight: Number(viewportMatch[2]) } : {}),
    ...(options.viewportPadding !== undefined ? { viewportPadding: options.viewportPadding } : {}),
    disabledRules: [...(fileConfig.disabledRules ?? []), ...((options.disable ?? []) as RuleId[])],
  };
  const result = await validateTarget(target, config);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.diagnostics.length === 0) console.log(`OpenPresent validation passed: ${target}`);
  else {
    console.log(result.diagnostics.map(formatDiagnostic).join('\n\n'));
    console.log(`\n${result.errorCount} error(s), ${result.warningCount} warning(s)`);
  }
  if (!result.valid || (options.warningsAsErrors && result.warningCount > 0)) process.exitCode = 1;
  return result;
}

export function createProgram() {
  const program = new Command();
  program
    .name('openpresent')
    .description('Create expressive, accessible, static HTML presentations with React and TypeScript.')
    .version(VERSION)
    .showHelpAfterError();

  program.command('create')
    .description('Create a self-contained OpenPresent starter deck.')
    .argument('<directory>', 'directory for the new deck')
    .option('-f, --force', 'overwrite starter files in a non-empty target')
    .option('--skill <name>', 'install an OpenPresent design-system skill with the starter')
    .action((directory: string, options: CreateOptions) => {
      const target = createStarter(directory, options);
      console.log(`Created OpenPresent deck at ${target}`);
      console.log(`Next: cd ${relative(process.cwd(), target) || '.'} && pnpm install && pnpm dev`);
    });

  program.command('dev')
    .description('Start a Vite development server with hot reload.')
    .argument('[entry]', 'deck entry or project directory (defaults to current directory)')
    .option('--host <host>', 'host to bind', '127.0.0.1')
    .option('-p, --port <port>', 'port to use', (value) => Number(value), 5173)
    .option('--open', 'open the deck in a browser')
    .action(async (entry: string | undefined, options: DevOptions) => { await startDevServer(entry, options); });

  program.command('build')
    .description('Build a portable static deck with relative asset paths.')
    .argument('[entry]', 'deck entry or project directory (defaults to current directory)')
    .option('-o, --out-dir <directory>', 'output directory', 'dist')
    .option('--sourcemap', 'write production source maps')
    .action(async (entry: string | undefined, options: BuildOptions) => {
      const output = await buildDeck(entry, options);
      console.log(`Built static OpenPresent deck at ${output}`);
    });

  program.command('studio')
    .description('Open the loopback-only AI authoring studio and live Vite preview.')
    .argument('[entry]', 'deck entry or project directory (defaults to current directory)')
    .option('--studio-port <port>', 'fixed Studio port (defaults to an available port)', (value) => Number(value))
    .option('--preview-port <port>', 'fixed preview port (defaults to an available port)', (value) => Number(value))
    .option('--open', 'open Studio in the default browser')
    .option('--create', 'scaffold the existing starter in an explicit empty target, then open Studio')
    .option('--skill <name>', 'install a vendable deck design skill while creating')
    .action(async (entry: string | undefined, options: StudioOptions) => {
      const server = await startAuthoringStudio(entry, options);
      console.log(`OpenPresent Studio: ${server.url}`);
      console.log(`Live deck preview: ${server.previewUrl}`);
      const shutdown = () => void server.close().finally(() => process.exit(0));
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });

  program.command('validate')
    .description('Validate a deck TSX/JSON entry, project directory, or running URL.')
    .argument('[target]', 'entry, project directory, or URL', '.')
    .option('-c, --config <file>', 'JSON validator configuration')
    .option('--json', 'emit structured JSON diagnostics')
    .option('--min-font-size <pixels>', 'minimum readable text size', (value) => Number(value))
    .option('--max-elements <count>', 'maximum content elements per slide', (value) => Number(value))
    .option('--viewport <width>x<height>', 'browser viewport for URL validation', '1440x900')
    .option('--viewport-padding <pixels>', 'off-canvas tolerance around the slide', (value) => Number(value))
    .addOption(new Option('--disable <rules...>', 'disable one or more rule IDs').default([]))
    .option('--warnings-as-errors', 'exit non-zero when warnings are present')
    .action(async (target: string, options: ValidateOptions) => { await runValidation(target, options); });

  const skills = program.command('skills').description('Discover and install agent-readable OpenPresent design-system skills.');
  skills.command('list')
    .description('List the skills shipped by @openpresent/skills.')
    .action(() => {
      for (const skill of listSkills()) console.log(`${skill.name}\t${skill.description}`);
    });
  skills.command('install')
    .description('Install a skill into a project-local agent skills directory.')
    .argument('<name>', 'skill name')
    .option('-t, --target <directory>', 'skills directory', '.agents/skills')
    .option('-f, --force', 'update known files in an existing skill directory')
    .action((name: string, options: { target: string; force?: boolean }) => {
      const destination = installSkill(name, resolve(options.target), { force: options.force });
      console.log(`Installed ${name} at ${destination}`);
    });

  return program;
}

export async function run(argv = process.argv) {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    console.error(`OpenPresent: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) void run();

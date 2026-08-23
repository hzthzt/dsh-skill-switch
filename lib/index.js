import z from "@deepseek-ai/schemastery";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { lstat, mkdir, opendir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, win32 } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "yaml";
//#region src/paths.ts
const DEFAULT_STORE_PATH = "~/.cc-switch/skills";
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Resolve the deliberately small configured-path grammar. */
function resolveStorePath(input, home = homedir()) {
	const value = input.trim();
	if (value === "~") return resolve(home);
	if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(join(home, value.slice(2)));
	if (!win32.isAbsolute(value) || !/^[A-Za-z]:[\\/]/.test(value)) throw new TypeError("Store path must be a Windows absolute path or start with ~");
	return win32.resolve(value);
}
/** Whether either path contains the other under Windows case-insensitive semantics. */
function pathsOverlap(left, right) {
	const a = win32.resolve(left).toLocaleLowerCase("en-US");
	const b = win32.resolve(right).toLocaleLowerCase("en-US");
	if (a === b) return true;
	const fromA = win32.relative(a, b);
	const fromB = win32.relative(b, a);
	return isContainedRelative(fromA) || isContainedRelative(fromB);
}
function isContainedRelative(value) {
	return value.length > 0 && value !== ".." && !value.startsWith(`..\\`) && !win32.isAbsolute(value);
}
function assertSkillName(name) {
	if (!SKILL_NAME_PATTERN.test(name)) throw new TypeError(`Invalid Skill name: ${name}`);
}
//#endregion
//#region src/manifest.ts
const EMPTY_MANIFEST = {
	version: 1,
	links: []
};
var ManifestStore = class {
	path;
	constructor(path) {
		this.path = path;
	}
	async read() {
		let text;
		try {
			text = await readFile(this.path, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return EMPTY_MANIFEST;
			throw error;
		}
		return validateManifest(JSON.parse(text));
	}
	async write(manifest) {
		const value = validateManifest(manifest);
		await mkdir(dirname(this.path), { recursive: true });
		const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
				encoding: "utf8",
				flag: "wx"
			});
			await rename(temporary, this.path);
		} finally {
			await rm(temporary, { force: true });
		}
	}
};
function validateManifest(value) {
	if (!isRecord$1(value) || value.version !== 1 || !Array.isArray(value.links)) throw new TypeError("Invalid skill-switch manifest");
	if (Object.keys(value).some((key) => key !== "version" && key !== "links")) throw new TypeError("Invalid skill-switch manifest fields");
	const names = /* @__PURE__ */ new Set();
	return {
		version: 1,
		links: value.links.map((entry) => {
			if (!isRecord$1(entry) || Object.keys(entry).some((key) => ![
				"name",
				"sourcePath",
				"identity"
			].includes(key))) throw new TypeError("Invalid skill-switch manifest record");
			if (typeof entry.name !== "string" || typeof entry.sourcePath !== "string" || !isRecord$1(entry.identity)) throw new TypeError("Invalid skill-switch manifest record values");
			assertSkillName(entry.name);
			if (names.has(entry.name)) throw new TypeError(`Duplicate manifest record: ${entry.name}`);
			names.add(entry.name);
			const identity = entry.identity;
			if (Object.keys(identity).some((key) => ![
				"dev",
				"ino",
				"birthtimeMs"
			].includes(key)) || typeof identity.dev !== "string" || typeof identity.ino !== "string" || typeof identity.birthtimeMs !== "number" || !Number.isFinite(identity.birthtimeMs)) throw new TypeError(`Invalid manifest identity: ${entry.name}`);
			return {
				name: entry.name,
				sourcePath: entry.sourcePath,
				identity: {
					dev: identity.dev,
					ino: identity.ino,
					birthtimeMs: identity.birthtimeMs
				}
			};
		})
	};
}
function isRecord$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
//#endregion
//#region src/scanner.ts
/** Scan only direct, physical child directories of the configured store. */
async function scanStore(storePath) {
	let directory;
	try {
		directory = await opendir(storePath);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
	const skills = [];
	for await (const entry of directory) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
		const sourcePath = join(storePath, entry.name);
		skills.push(await inspectSkill(entry.name, sourcePath));
	}
	const counts = /* @__PURE__ */ new Map();
	for (const skill of skills) if (skill.valid) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
	return skills.map((skill) => skill.valid && counts.get(skill.name) > 1 ? invalid(skill.name, skill.sourcePath, `Duplicate frontmatter name "${skill.name}" is declared by multiple source directories.`) : skill).sort((a, b) => a.name.localeCompare(b.name, "en") || a.sourcePath.localeCompare(b.sourcePath, "en"));
}
async function inspectSkill(directoryName, sourcePath) {
	const skillFile = join(sourcePath, "SKILL.md");
	try {
		const stat = await lstat(skillFile);
		if (!stat.isFile() || stat.isSymbolicLink()) return invalid(directoryName, sourcePath, "SKILL.md must be a regular file.");
		const frontmatter = parseFrontmatter(await readFile(skillFile, "utf8"));
		if (!isRecord(frontmatter)) return invalid(directoryName, sourcePath, "SKILL.md frontmatter must be a YAML mapping.");
		if (typeof frontmatter.name !== "string") return invalid(directoryName, sourcePath, "Frontmatter name must be a string.");
		const name = frontmatter.name;
		if (!SKILL_NAME_PATTERN.test(name)) return invalid(name, sourcePath, "Frontmatter name must be kebab-case.");
		if (typeof frontmatter.description !== "string" || frontmatter.description.trim().length === 0) return invalid(name, sourcePath, "Frontmatter description must be a non-empty string.");
		return {
			name,
			sourcePath,
			description: frontmatter.description.trim(),
			valid: true,
			diagnostic: ""
		};
	} catch (error) {
		return invalid(directoryName, sourcePath, `Invalid SKILL.md: ${error instanceof Error ? error.message : String(error)}`);
	}
}
function parseFrontmatter(text) {
	const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) throw new TypeError("missing YAML frontmatter");
	const end = normalized.indexOf("\n---", 4);
	if (end < 0) throw new TypeError("unterminated YAML frontmatter");
	const suffix = normalized.slice(end + 4, end + 5);
	if (suffix !== "" && suffix !== "\n") throw new TypeError("frontmatter delimiter must be on its own line");
	return parse(normalized.slice(4, end), { uniqueKeys: true });
}
function invalid(name, sourcePath, diagnostic) {
	return {
		name,
		sourcePath,
		description: "",
		valid: false,
		diagnostic
	};
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
//#endregion
//#region src/manager.ts
/** Owns filesystem discovery and mutation behind one operation queue. */
var SkillSwitchManager = class {
	options;
	targetPath;
	manifest;
	platform;
	userHome;
	tail = Promise.resolve();
	constructor(options) {
		this.options = options;
		this.platform = options.platform ?? process.platform;
		this.userHome = options.userHome ?? homedir();
		this.targetPath = join(resolve(options.dshHome), "skills");
		this.manifest = new ManifestStore(join(resolve(options.dshHome), "skill-switch", "manifest.json"));
	}
	snapshot() {
		return this.enqueue(() => this.scan());
	}
	setEnabled(name, enabled) {
		return this.enqueue(async () => {
			this.assertSupported();
			assertSkillName(name);
			if (enabled) await this.enable(name);
			else await this.disable(name);
			return this.scan();
		});
	}
	disableAll() {
		return this.enqueue(async () => {
			this.assertSupported();
			const manifest = await this.manifest.read();
			let links = [...manifest.links];
			for (const record of manifest.links) if (await this.removeOwned(record)) links = links.filter((link) => link.name !== record.name);
			await this.writeIfChanged(manifest, links);
			return this.scan();
		});
	}
	setStorePath(path) {
		return this.enqueue(async () => {
			this.assertSupported();
			const next = resolveStorePath(path, this.userHome);
			this.assertSeparated(next);
			if ((await this.reconcileManifest(await this.manifest.read())).links.length > 0) throw new Error("Disable all managed Skills before changing the central directory.");
			await this.options.setStorePath(path.trim());
			return this.scan();
		});
	}
	enqueue(operation) {
		const run = this.tail.catch(() => void 0).then(operation);
		this.tail = run.then(() => void 0, () => void 0);
		return run;
	}
	async scan() {
		const storePath = resolveStorePath(this.options.getStorePath() || "~/.cc-switch/skills", this.userHome);
		if (this.platform !== "win32") return {
			platform: "unsupported-platform",
			platformDiagnostic: "dsh-skill-switch requires Windows Junction support.",
			storePath,
			targetPath: this.targetPath,
			managedEnabledCount: 0,
			skills: [],
			externalTargets: []
		};
		this.assertSeparated(storePath);
		const manifest = await this.reconcileManifest(await this.manifest.read());
		const owned = new Map(manifest.links.map((record) => [record.name, record]));
		const targets = await this.scanTargets(owned);
		const externalNames = new Set(targets.map((entry) => entry.name));
		const scanned = await scanStore(storePath);
		const matchedRecords = /* @__PURE__ */ new Set();
		const skills = [];
		for (const skill of scanned) {
			const record = owned.get(skill.name);
			if (record !== void 0 && !samePath(record.sourcePath, skill.sourcePath)) continue;
			if (record !== void 0) matchedRecords.add(record.name);
			skills.push(this.toEntry(skill, record, externalNames.has(skill.name)));
		}
		for (const record of manifest.links) {
			if (matchedRecords.has(record.name)) continue;
			skills.push({
				name: record.name,
				description: "",
				sourcePath: record.sourcePath,
				targetPath: join(this.targetPath, record.name),
				status: "broken",
				managed: true,
				diagnostic: "The managed source is missing or no longer declares this Skill. Disable it before enabling another source."
			});
		}
		skills.sort((a, b) => a.name.localeCompare(b.name, "en") || a.sourcePath.localeCompare(b.sourcePath, "en"));
		return {
			platform: "supported",
			platformDiagnostic: "",
			storePath,
			targetPath: this.targetPath,
			managedEnabledCount: manifest.links.length,
			skills,
			externalTargets: targets
		};
	}
	async enable(name) {
		const storePath = resolveStorePath(this.options.getStorePath() || "~/.cc-switch/skills", this.userHome);
		this.assertSeparated(storePath);
		const candidates = (await scanStore(storePath)).filter((candidate) => candidate.name === name);
		const skill = candidates.find((candidate) => candidate.valid);
		if (skill === void 0) {
			if (candidates[0] !== void 0) throw new Error(candidates[0].diagnostic);
			throw new Error(`Skill not found: ${name}`);
		}
		const manifest = await this.reconcileManifest(await this.manifest.read());
		if (manifest.links.some((record) => record.name === name)) return;
		const target = join(this.targetPath, name);
		if (await exists(target)) throw new Error(`Target is externally managed: ${target}`);
		await mkdir(this.targetPath, { recursive: true });
		await symlink(skill.sourcePath, target, "junction");
		let record;
		try {
			const stat = await lstat(target, { bigint: true });
			if (!stat.isSymbolicLink() || !samePath(await readlink(target), skill.sourcePath)) throw new Error(`Created target is not the expected Junction: ${target}`);
			record = {
				name,
				sourcePath: resolve(skill.sourcePath),
				identity: identityOf(stat)
			};
			await this.manifest.write({
				version: 1,
				links: [...manifest.links, record]
			});
		} catch (error) {
			if (record === void 0 || await this.matchesRecord(record)) await rm(target, { force: true });
			throw error;
		}
	}
	async disable(name) {
		const manifest = await this.reconcileManifest(await this.manifest.read());
		const record = manifest.links.find((candidate) => candidate.name === name);
		if (record === void 0) throw new Error(`Skill is not managed by this plugin: ${name}`);
		if (!await this.removeOwned(record)) {
			await this.manifest.write({
				version: 1,
				links: manifest.links.filter((link) => link.name !== name)
			});
			throw new Error(`Ownership was lost before disable: ${name}`);
		}
		await this.manifest.write({
			version: 1,
			links: manifest.links.filter((link) => link.name !== name)
		});
	}
	async reconcileManifest(manifest) {
		const links = [];
		for (const record of manifest.links) {
			if (!await exists(join(this.targetPath, record.name))) continue;
			if (await this.matchesRecord(record)) links.push(record);
		}
		await this.writeIfChanged(manifest, links);
		return links.length === manifest.links.length ? manifest : {
			version: 1,
			links
		};
	}
	async writeIfChanged(before, links) {
		if (links.length === before.links.length && links.every((link, index) => link === before.links[index])) return;
		await this.manifest.write({
			version: 1,
			links
		});
	}
	async removeOwned(record) {
		assertSkillName(record.name);
		const target = join(this.targetPath, record.name);
		if (!await this.matchesRecord(record)) return false;
		await rm(target, { force: true });
		return true;
	}
	async matchesRecord(record) {
		const target = join(this.targetPath, record.name);
		try {
			const stat = await lstat(target, { bigint: true });
			return stat.isSymbolicLink() && sameIdentity(identityOf(stat), record.identity) && samePath(await readlink(target), record.sourcePath);
		} catch {
			return false;
		}
	}
	async scanTargets(owned) {
		let directory;
		try {
			directory = await opendir(this.targetPath);
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		const targets = [];
		for await (const entry of directory) {
			if (owned.has(entry.name)) continue;
			targets.push({
				name: entry.name,
				targetPath: join(this.targetPath, entry.name),
				kind: entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
				diagnostic: "This target is externally managed and will not be changed."
			});
		}
		return targets.sort((a, b) => a.name.localeCompare(b.name, "en"));
	}
	toEntry(skill, record, conflict) {
		const targetPath = join(this.targetPath, skill.name);
		if (!skill.valid) return {
			name: skill.name,
			description: "",
			sourcePath: skill.sourcePath,
			targetPath,
			status: "invalid",
			managed: record !== void 0,
			diagnostic: skill.diagnostic
		};
		if (record !== void 0) return {
			name: skill.name,
			description: skill.description,
			sourcePath: skill.sourcePath,
			targetPath,
			status: "enabled",
			managed: true,
			diagnostic: ""
		};
		if (conflict) return {
			name: skill.name,
			description: skill.description,
			sourcePath: skill.sourcePath,
			targetPath,
			status: "conflict",
			managed: false,
			diagnostic: "A file, directory, or unowned link already exists at the DSH target."
		};
		return {
			name: skill.name,
			description: skill.description,
			sourcePath: skill.sourcePath,
			targetPath,
			status: "available",
			managed: false,
			diagnostic: ""
		};
	}
	assertSeparated(storePath) {
		if (pathsOverlap(storePath, this.targetPath)) throw new Error("The central directory and DSH skills directory must not contain one another.");
	}
	assertSupported() {
		if (this.platform !== "win32") throw new Error("unsupported-platform: Windows Junctions are required.");
	}
};
function identityOf(stat) {
	const value = stat;
	return {
		dev: String(value.dev),
		ino: String(value.ino),
		birthtimeMs: Number(value.birthtimeMs)
	};
}
function sameIdentity(left, right) {
	return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}
function samePath(left, right) {
	return normalizePath(left) === normalizePath(right);
}
function normalizePath(value) {
	return resolve(value.replace(/^\\\\\?\\/, "")).toLocaleLowerCase("en-US");
}
async function exists(path) {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}
//#endregion
//#region src/index.ts
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const name = "dsh-skill-switch";
const SETTINGS_NAMESPACE = settingsNamespace("skill-switch");
const SettingsSchema = z.object({ storePath: z.string().default(DEFAULT_STORE_PATH) });
/** Host Remote service and sole owner of Skill Junction mutations. */
let SkillSwitchService = (() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _snapshot_decorators;
	let _setEnabled_decorators;
	let _disableAll_decorators;
	let _setStorePath_decorators;
	return class SkillSwitchService extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_snapshot_decorators = [Remote];
			_setEnabled_decorators = [Remote];
			_disableAll_decorators = [Remote];
			_setStorePath_decorators = [Remote];
			__esDecorate(this, null, _snapshot_decorators, {
				kind: "method",
				name: "snapshot",
				static: false,
				private: false,
				access: {
					has: (obj) => "snapshot" in obj,
					get: (obj) => obj.snapshot
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setEnabled_decorators, {
				kind: "method",
				name: "setEnabled",
				static: false,
				private: false,
				access: {
					has: (obj) => "setEnabled" in obj,
					get: (obj) => obj.setEnabled
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _disableAll_decorators, {
				kind: "method",
				name: "disableAll",
				static: false,
				private: false,
				access: {
					has: (obj) => "disableAll" in obj,
					get: (obj) => obj.disableAll
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _setStorePath_decorators, {
				kind: "method",
				name: "setStorePath",
				static: false,
				private: false,
				access: {
					has: (obj) => "setStorePath" in obj,
					get: (obj) => obj.setStorePath
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = ["settings"];
		settings = __runInitializers(this, _instanceExtraInitializers);
		manager;
		constructor(ctx) {
			super(ctx, "skillSwitch");
			this.settings = ctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema);
			this.manager = new SkillSwitchManager({
				dshHome: dshHomePath(),
				getStorePath: () => this.settings.get().storePath,
				setStorePath: async (storePath) => this.settings.update({ storePath })
			});
		}
		/** Return a fresh filesystem snapshot. */
		snapshot() {
			return this.manager.snapshot();
		}
		/** Enable or disable one named Skill and return the resulting snapshot. */
		setEnabled(name, enabled) {
			return this.manager.setEnabled(name, enabled);
		}
		/** Disable every Junction still verified as owned by this plugin. */
		disableAll() {
			return this.manager.disableAll();
		}
		/** Persist and activate a new central Skill directory. */
		setStorePath(path) {
			return this.manager.setStorePath(path);
		}
	};
})();
//#endregion
export { DEFAULT_STORE_PATH, ManifestStore, SETTINGS_NAMESPACE, SkillSwitchManager, SkillSwitchService, SkillSwitchService as default, name, pathsOverlap, resolveStorePath, scanStore, validateManifest };

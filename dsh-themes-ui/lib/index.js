import z from "@deepseek-ai/schemastery";
//#region src/preference.ts
/**
* Durable selection contract for third-party themes.
*
* The host's built-in theme schema (`ui-theme.preference`) only accepts
* `light`/`dark`/`system`, so this plugin owns its own settings namespace for
* third-party ids. The value `system` is the sentinel meaning "no override —
* follow the host preference".
*
* Both halves of the plugin import this module, so it stays free of host
* packages: the browser module table serves platform seed words and shell-own
* modules only, and a client bundle requiring anything else fails to load.
* The schemastery envelope built on these names lives in `./schema.ts`, which
* only the Node half imports.
*/
/** Settings namespace owned by the picker plugin. */
const THEMES_NAMESPACE = "dsh-themes";
/** Field carrying the selected third-party theme id (or `system`). */
const THEME_FIELD = "theme";
/** Durable marker meaning "no third-party override; follow the host". */
const DEFAULT_SELECTION = "system";
//#endregion
//#region src/schema.ts
/**
* Durable settings schema for the picker's namespace, expressed with
* `@deepseek-ai/schemastery` (the host's schema library) so Host-side
* registration reuses it verbatim.
*
* Only the Node half imports this module. Schemastery is a host package the
* dsh installation resolves through the profile's module fallback; the
* browser module table does not serve it, so pulling this module into the
* client bundle would fail the plugin load.
*/
/**
* Durable schema; also the wire envelope the settings scope validates
* against. The default keeps the field optional in the stored document.
*/
const THEME_PREFERENCE_SCHEMA = z.object({ [THEME_FIELD]: z.string().default(DEFAULT_SELECTION) });
//#endregion
//#region src/index.ts
/**
* Host-side registration for the picker's durable settings namespace. The
* browser plugin body lives in `./client.ts`; this entry is the Node half the
* dsh Loader mounts when a composition row names this package, mirroring the
* host/client split of `@deepseek-ai/dsh-client-ui-theme` (its Host entry
* registers the settings namespace, its client entry owns the browser face).
*
* Declared structurally so the package type-checks without the dsh
* application tree; at runtime the real host Context satisfies it.
*/
/** Optional services this entry consumes. */
const inject = ["settings"];
/**
* Host plugin body: register the durable `dsh-themes` namespace into the Host
* settings service when one is composed, so the settings document accepts and
* schema-validates the third-party theme selection.
*/
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(THEMES_NAMESPACE, THEME_PREFERENCE_SCHEMA);
	});
}
//#endregion
export { apply, inject };

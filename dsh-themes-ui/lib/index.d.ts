//#region src/index.d.ts
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
/** The host settings face this entry consumes. */
interface HostSettingsService {
  register(namespace: string, schema: unknown): void;
}
/** The host plugin face the dsh Loader mounts. */
interface PickerHostContext {
  inject(deps: string[], callback: (ctx: {
    settings: HostSettingsService;
  }) => void): void;
}
/** Optional services this entry consumes. */
declare const inject: readonly ["settings"];
/**
 * Host plugin body: register the durable `dsh-themes` namespace into the Host
 * settings service when one is composed, so the settings document accepts and
 * schema-validates the third-party theme selection.
 */
declare function apply(ctx: PickerHostContext): void;
//#endregion
export { HostSettingsService, PickerHostContext, apply, inject };
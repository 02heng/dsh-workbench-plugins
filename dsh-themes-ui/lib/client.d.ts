import type { PickerSettingsScope, PickerThemeService } from "./picker.ts";
import type { ThemeFace } from "./ThemePickerRow.tsx";
/** Locale namespace owning this row's copy. */
export declare const SETTINGS_NS = "settings.dsh-themes";
/**
 * Swatch colours for every shipped theme, read from the catalog this package
 * already bundles. The host theme snapshot carries no token payload, so the
 * picker gets its preview colours from here rather than widening that
 * contract. Themes absent from this table (registered by another plugin)
 * render without a swatch and under a humanized id.
 */
export declare const THEME_FACES: Readonly<Record<string, ThemeFace>>;
/**
 * The browser plugin face the dsh loader mounts. Declared structurally so the
 * package type-checks without the dsh application tree; at runtime the real
 * client Context satisfies it.
 */
export interface PickerClientContext {
    effect(thunk: () => unknown, label?: string): void;
    on(event: string, listener: (payload: unknown) => void): () => void;
    theme: PickerThemeService;
    settingsScope: {
        bind<T>(spec: {
            namespace: string;
        }): PickerSettingsScope<T>;
    };
    slots: {
        inject(name: string, factory: () => unknown): void;
        register(entry: unknown, component: unknown): unknown;
    };
    locale: {
        register(namespace: string, dict: Record<string, Record<string, string>>): void;
    };
}
/** Services this plugin consumes. */
export declare const inject: readonly ["theme", "settingsScope", "slots", "locale"];
/**
 * Client plugin body: register all shipped themes, own the durable
 * third-party selection, and inject the picker row into the settings General
 * section (id `themes`, order 11 — right after the host Appearance row).
 */
export declare function apply(ctx: PickerClientContext): void;

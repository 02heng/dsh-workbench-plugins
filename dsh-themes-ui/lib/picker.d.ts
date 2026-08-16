import type { ThemeRegistry } from "@dshthemes/core";
import type { ThemePreferenceSettings } from "./preference.ts";
/** One theme as the picker renders it (no token payload). */
export interface PickerTheme {
    id: string;
    colorScheme: "light" | "dark";
}
/** Snapshot subset the picker consumes from the host theme service. */
export interface PickerThemeSnapshot {
    preference: string;
    active: PickerTheme;
    themes: readonly PickerTheme[];
    revision: number;
}
/** Payload carried by the host's `theme/change` event. */
export interface ThemeChangePayload {
    preference: string;
    active: PickerTheme;
}
/** The host theme service face the picker consumes (a superset of registration). */
export interface PickerThemeService extends ThemeRegistry {
    getTheme(): PickerThemeSnapshot;
    setTheme(id: string): void;
}
/** Durable scope face the picker consumes (mirrors the host SettingsScope). */
export interface PickerSettingsScope<T> {
    getSnapshot(): {
        status: string;
        value: T | undefined;
        writable: boolean;
        mode: string;
    };
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<void>;
}
/** One assembled picker instance. */
export interface Picker {
    /** Adopt the persisted third-party selection when it is still registered. */
    restore(): void;
    /** Persist the active theme when it is third-party; clear the marker for built-ins. */
    sync(payload: ThemeChangePayload): Promise<void>;
    /** Switch the theme through the host service. */
    setTheme(id: string): void;
    /** Read the current theme snapshot. */
    getTheme(): PickerThemeSnapshot;
    /** Drop the scope subscription. */
    dispose(): void;
}
/**
 * Assemble a picker over the host theme service and the durable settings
 * scope. All reads go through the service snapshot; all writes either the
 * service (selection) or the scope (durability).
 */
export declare function createPicker(theme: PickerThemeService, scope: PickerSettingsScope<ThemePreferenceSettings>): Picker;

import type { PickerStoreState } from "./store.ts";
export type { PickerStoreState };
/** The two colours that identify one theme at a glance. */
export interface ThemeFace {
    base: string;
    accent: string;
}
/** Props composed by the slot framework: store hook, locale seat, injected face. */
export interface ThemePickerRowProps {
    useStore: <T>(selector: (state: PickerStoreState) => T) => T;
    t: (key: string) => string;
    setTheme: (id: string) => void;
    faces: Readonly<Record<string, ThemeFace>>;
}
/**
 * Theme picker row: the built-in preference cubes plus one swatched entry per
 * registered third-party theme, all inside one radiogroup because the
 * preference holds a single value. Selection goes through the injected
 * `setTheme`; the checked state follows the preference.
 */
export declare function ThemePickerRow({ useStore, t, setTheme, faces, }: ThemePickerRowProps): import("react").JSX.Element;

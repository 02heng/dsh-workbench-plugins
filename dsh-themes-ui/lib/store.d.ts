import { type EngineStoreHandle } from "@deepseek-ai/dsh-client-store";
import type { PickerTheme } from "./picker.ts";
/** Store state mirrored from the theme snapshot. */
export interface PickerStoreState {
    preference: string;
    activeId: string;
    themes: readonly PickerTheme[];
    revision: number;
}
/** Declared action shape giving the exported factory a stable return type. */
export type PickerStoreActions = {
    sync: (draft: PickerStoreState, state: PickerStoreState) => void;
};
/**
 * Declare the picker row state and its single write action. The slot
 * machinery binds the `useStore` hook and baked `actions` from this handle;
 * the plugin's apply-world change listener is the only writer.
 */
export declare function createPickerStore(): EngineStoreHandle<PickerStoreState, PickerStoreActions>;

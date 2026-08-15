import type {LyricsAppearanceSettings} from "./LyricsAppearanceSettingsService";

export interface LyricsAppearanceSettingsElements {
    colorModeSelect: HTMLSelectElement | null;
    sungColorInput: HTMLInputElement | null;
    sungColorValue: HTMLElement | null;
    unsungColorInput: HTMLInputElement | null;
    unsungColorValue: HTMLElement | null;
    showTranslationToggle: HTMLInputElement | null;
    showRomanizationToggle: HTMLInputElement | null;
    showRubyToggle: HTMLInputElement | null;
}

class LyricsAppearanceSettingsRenderer {
    initialize(elements: LyricsAppearanceSettingsElements, settings: LyricsAppearanceSettings): void {
        if (elements.colorModeSelect) elements.colorModeSelect.value = settings.colorMode;
        this.updateSungColor(elements, settings.sungColor);
        this.updateUnsungColor(elements, settings.unsungColor);
        this.updateAvailability(elements, settings.colorMode);
        if (elements.showTranslationToggle) elements.showTranslationToggle.checked = settings.showTranslation;
        if (elements.showRomanizationToggle) elements.showRomanizationToggle.checked = settings.showRomanization;
        if (elements.showRubyToggle) elements.showRubyToggle.checked = settings.showRuby;
    }

    updateSungColor(elements: LyricsAppearanceSettingsElements, color: string): void {
        if (elements.sungColorInput) elements.sungColorInput.value = color;
        if (elements.sungColorValue) elements.sungColorValue.textContent = color;
    }

    updateUnsungColor(elements: LyricsAppearanceSettingsElements, color: string): void {
        if (elements.unsungColorInput) elements.unsungColorInput.value = color;
        if (elements.unsungColorValue) elements.unsungColorValue.textContent = color;
    }

    updateAvailability(elements: LyricsAppearanceSettingsElements, mode: 'auto' | 'custom'): void {
        if (elements.sungColorInput) elements.sungColorInput.disabled = mode !== 'custom';
        if (elements.unsungColorInput) elements.unsungColorInput.disabled = mode !== 'custom';
    }
}

export const lyricsAppearanceSettingsRenderer = new LyricsAppearanceSettingsRenderer();

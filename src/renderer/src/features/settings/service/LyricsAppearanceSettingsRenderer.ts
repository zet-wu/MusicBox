import type {LyricsAppearanceSettings} from "./LyricsAppearanceSettingsService";

export interface LyricsAppearanceSettingsElements {
    colorModeSelect: HTMLSelectElement | null;
    textColorInput: HTMLInputElement | null;
    textColorValue: HTMLElement | null;
    showTranslationToggle: HTMLInputElement | null;
    showRomanizationToggle: HTMLInputElement | null;
    showRubyToggle: HTMLInputElement | null;
}

class LyricsAppearanceSettingsRenderer {
    initialize(elements: LyricsAppearanceSettingsElements, settings: LyricsAppearanceSettings): void {
        if (elements.colorModeSelect) elements.colorModeSelect.value = settings.colorMode;
        this.updateColor(elements, settings.textColor);
        this.updateAvailability(elements, settings.colorMode);
        if (elements.showTranslationToggle) elements.showTranslationToggle.checked = settings.showTranslation;
        if (elements.showRomanizationToggle) elements.showRomanizationToggle.checked = settings.showRomanization;
        if (elements.showRubyToggle) elements.showRubyToggle.checked = settings.showRuby;
    }

    updateColor(elements: LyricsAppearanceSettingsElements, color: string): void {
        if (elements.textColorInput) elements.textColorInput.value = color;
        if (elements.textColorValue) elements.textColorValue.textContent = color;
    }

    updateAvailability(elements: LyricsAppearanceSettingsElements, mode: 'auto' | 'custom'): void {
        if (elements.textColorInput) elements.textColorInput.disabled = mode !== 'custom';
    }
}

export const lyricsAppearanceSettingsRenderer = new LyricsAppearanceSettingsRenderer();

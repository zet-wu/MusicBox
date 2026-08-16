import type {LyricsAppearanceSettings} from "./LyricsAppearanceSettingsService";

export interface LyricsAppearanceSettingsElements {
    colorModeSelect: HTMLSelectElement | null;
    textColorInput: HTMLInputElement | null;
    textColorValue: HTMLElement | null;
    fontFamilySelect: HTMLSelectElement | null;
    customFontContainer: HTMLElement | null;
    customLatinFontInput: HTMLInputElement | null;
    customCjkFontInput: HTMLInputElement | null;
    fontSizeSelect: HTMLSelectElement | null;
    showTranslationToggle: HTMLInputElement | null;
    showRomanizationToggle: HTMLInputElement | null;
    showRubyToggle: HTMLInputElement | null;
}

class LyricsAppearanceSettingsRenderer {
    initialize(elements: LyricsAppearanceSettingsElements, settings: LyricsAppearanceSettings): void {
        if (elements.colorModeSelect) elements.colorModeSelect.value = settings.colorMode;
        this.updateTextColor(elements, settings.textColor);
        this.updateAvailability(elements, settings.colorMode);
        if (elements.fontFamilySelect) elements.fontFamilySelect.value = settings.fontFamily;
        if (elements.customLatinFontInput) elements.customLatinFontInput.value = settings.customLatinFont;
        if (elements.customCjkFontInput) elements.customCjkFontInput.value = settings.customCjkFont;
        this.updateFontAvailability(elements, settings.fontFamily);
        if (elements.fontSizeSelect) elements.fontSizeSelect.value = settings.fontSize === null ? 'auto' : String(settings.fontSize);
        if (elements.showTranslationToggle) elements.showTranslationToggle.checked = settings.showTranslation;
        if (elements.showRomanizationToggle) elements.showRomanizationToggle.checked = settings.showRomanization;
        if (elements.showRubyToggle) elements.showRubyToggle.checked = settings.showRuby;
    }

    updateTextColor(elements: LyricsAppearanceSettingsElements, color: string): void {
        if (elements.textColorInput) elements.textColorInput.value = color;
        if (elements.textColorValue) elements.textColorValue.textContent = color;
    }

    updateAvailability(elements: LyricsAppearanceSettingsElements, mode: 'auto' | 'custom'): void {
        if (elements.textColorInput) elements.textColorInput.disabled = mode !== 'custom';
    }

    updateFontAvailability(elements: LyricsAppearanceSettingsElements, fontFamily: string): void {
        if (elements.customFontContainer) {
            elements.customFontContainer.hidden = fontFamily !== 'custom';
        }
    }
}

export const lyricsAppearanceSettingsRenderer = new LyricsAppearanceSettingsRenderer();

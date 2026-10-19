import { isNonEmptyString } from '@sniptt/guards';

const WINDOWS_1252_HIGH_CHARACTERS =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';

const toWindows1252Byte = (character: string) => {
  const highCharacterIndex = WINDOWS_1252_HIGH_CHARACTERS.indexOf(character);

  return highCharacterIndex >= 0
    ? 0x80 + highCharacterIndex
    : character.charCodeAt(0);
};

// Some imported addresses were saved as UTF-8 bytes read as Windows-1252 ("Ã‡ankaya").
const repairMisencodedText = (text: string) => {
  if (!/[ÃÂ]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from(text, toWindows1252Byte);

    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
};

const toTitleCaseWhenSingleCase = (text: string) => {
  const isSingleCase =
    text === text.toUpperCase() || text === text.toLowerCase();

  if (!isSingleCase) {
    return text;
  }

  return text
    .toLowerCase()
    .replace(
      /(^|[\s\-'(/])(\p{L})/gu,
      (_match, separator: string, letter: string) =>
        separator + letter.toUpperCase(),
    );
};

export const normalizePlaceName = (
  placeName: string | null | undefined,
  aliases: Record<string, string>,
) => {
  const cleanedPlaceName = repairMisencodedText(placeName ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,]+$/, '');

  if (!isNonEmptyString(cleanedPlaceName)) {
    return null;
  }

  return (
    aliases[cleanedPlaceName.toLowerCase()] ??
    toTitleCaseWhenSingleCase(cleanedPlaceName)
  );
};

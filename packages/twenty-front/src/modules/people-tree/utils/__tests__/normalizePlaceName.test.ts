import { PEOPLE_TREE_CITY_ALIASES } from '@/people-tree/constants/PeopleTreeCityAliases';
import { normalizePlaceName } from '@/people-tree/utils/normalizePlaceName';

describe('normalizePlaceName', () => {
  it('title-cases names written in a single case', () => {
    expect(normalizePlaceName('RIYADH', {})).toBe('Riyadh');
    expect(normalizePlaceName('yanbu industrial city', {})).toBe(
      'Yanbu Industrial City',
    );
  });

  it('keeps mixed-case names as written', () => {
    expect(normalizePlaceName('McAllen', {})).toBe('McAllen');
  });

  it('applies aliases case-insensitively', () => {
    expect(normalizePlaceName('Jiddah', PEOPLE_TREE_CITY_ALIASES)).toBe(
      'Jeddah',
    );
  });

  it('repairs text saved with the wrong encoding', () => {
    expect(normalizePlaceName('Beytepe Ã‡ankaya. Ankara', {})).toBe(
      'Beytepe Çankaya. Ankara',
    );
  });

  it('returns null for blank values', () => {
    expect(normalizePlaceName('  ', {})).toBeNull();
    expect(normalizePlaceName(undefined, {})).toBeNull();
  });
});

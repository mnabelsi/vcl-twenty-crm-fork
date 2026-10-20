import { getZonedDateParts } from 'src/modules/email-sequence/utils/get-zoned-date-parts.util';
import { zonedTimeToUtc } from 'src/modules/email-sequence/utils/zoned-time-to-utc.util';

export const getStartOfZonedDay = (date: Date, timeZone: string): Date => {
  const { year, month, day } = getZonedDateParts(date, timeZone);

  return zonedTimeToUtc({ year, month, day, hour: 0, timeZone });
};

import { type EmailSequenceSendWindow } from 'src/modules/email-sequence/types/email-sequence-send-window.type';
import { getZonedDateParts } from 'src/modules/email-sequence/utils/get-zoned-date-parts.util';
import { zonedTimeToUtc } from 'src/modules/email-sequence/utils/zoned-time-to-utc.util';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_TO_SCAN = 8;

export const isWithinSendWindow = (
  date: Date,
  sendWindow: EmailSequenceSendWindow,
): boolean => {
  const { weekday, hour } = getZonedDateParts(date, sendWindow.timeZone);

  return (
    sendWindow.sendDays.includes(weekday) &&
    hour >= sendWindow.sendWindowStartHour &&
    hour < sendWindow.sendWindowEndHour
  );
};

// Returns `from` when it is already inside the window, otherwise the next window opening
export const getNextSendWindowStart = (
  from: Date,
  sendWindow: EmailSequenceSendWindow,
): Date => {
  if (isWithinSendWindow(from, sendWindow)) {
    return from;
  }

  for (let dayOffset = 0; dayOffset < MAX_DAYS_TO_SCAN; dayOffset++) {
    const parts = getZonedDateParts(
      new Date(from.getTime() + dayOffset * DAY_IN_MS),
      sendWindow.timeZone,
    );

    if (!sendWindow.sendDays.includes(parts.weekday)) {
      continue;
    }

    const windowStart = zonedTimeToUtc({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: sendWindow.sendWindowStartHour,
      timeZone: sendWindow.timeZone,
    });

    if (windowStart.getTime() > from.getTime()) {
      return windowStart;
    }
  }

  throw new Error('Email sequence send window has no sending day configured');
};

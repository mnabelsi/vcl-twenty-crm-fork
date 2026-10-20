const AUTOMATIC_REPLY_SUBJECT_PATTERN =
  /^\s*(automatic reply|auto(matic)?[- ]?reply|auto:|out of (the )?office|ooo\b|away from (the )?office|on leave|on vacation|رد تلقائي|خارج المكتب)/i;

// Out-of-office replies should not end a sequence
export const isAutomaticReply = (subject: string | null): boolean =>
  AUTOMATIC_REPLY_SUBJECT_PATTERN.test(subject ?? '');

// Pushes nextSendAt forward while a worker sends, so a parallel run skips the row
export const EMAIL_SEQUENCE_CLAIM_LEASE_MS = 10 * 60 * 1000;

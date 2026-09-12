/**
 * The two facts the upload control and the upload route both need (`CMS-003`).
 *
 * They live apart from the store because the control is a client component: a
 * module that reaches `media.ts` would pull the image encoder, the PDF parser and
 * the database pool into the browser bundle to read one number.
 *
 * Neither of these is the enforcement. The cap is refused again on the server
 * after the bytes arrive, and what a file *is* is decided by sniffing its bytes
 * (`CMS-003/T1`) rather than by the picker's filter or by any extension — both of
 * those are the uploader's to write.
 */

/** Ten megabytes, stated in the control before a file is chosen (`CMS-003` §3). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * What the file picker offers, as a hint to the person choosing. It names the
 * extensions of the accepted types and nothing about what will be accepted: a
 * renamed file passes this and is turned away by the sniff.
 */
export const UPLOAD_ACCEPT = '.png,.jpg,.jpeg,.pdf';

/** The cap as a person reads it, for the sentence the control shows. */
export const MAX_UPLOAD_LABEL = '10 MB';

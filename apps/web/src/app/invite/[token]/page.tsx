import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getTranslations } from 'next-intl/server';

import { SetPasswordView } from '../../set-password/set-password-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('setPassword');
  return { title: t('title') };
}

/**
 * `GET /invite/<token>` (`AUTH-003/T4`) — where an invited person sets their
 * password. The body is the shared set-password view; this route only names the
 * token segment it reads.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  return <SetPasswordView token={token} />;
}

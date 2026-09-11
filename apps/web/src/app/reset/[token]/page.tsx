import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { getTranslations } from 'next-intl/server';

import { SetPasswordView } from '../../set-password/set-password-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('setPassword');
  return { title: t('title') };
}

/**
 * `GET /reset/<token>` (`AUTH-003/T4`) — where a person who asked to reset a
 * forgotten password chooses a new one. The same view and the same consumption
 * path as the invitation: the two flows differ only in how the token was issued.
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}): Promise<ReactElement> {
  const { token } = await params;
  return <SetPasswordView token={token} />;
}

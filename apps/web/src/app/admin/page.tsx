import type { ReactElement } from 'react';

/**
 * The console's landing surface is *what needs attention* rather than a
 * dashboard of counts (`ADMIN-002` §3). The items it will list — content with
 * unreviewed locales, decks whose grants were never opened, a portfolio row gone
 * stale, the open questions in the register — each arrive with the feature that
 * raises them (`ADMIN-002/T2`); until those features exist there is nothing to
 * attend to, which is the honest thing for an empty console to say.
 */
export default function AdminLanding(): ReactElement {
  return (
    <>
      <h1>What needs attention</h1>
      <p>
        Nothing yet. As content, decks, the portfolio board and the decision register
        come online, the things waiting on an admin will be listed here.
      </p>
    </>
  );
}

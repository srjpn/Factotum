'use client';

import { useActionState } from 'react';
import { decide } from './actions';

export function DecisionButtons({ id }: { id: string }) {
  const [approveError, approve, approving] = useActionState(decide.bind(null, id, 'approve'), null);
  const [denyError, deny, denying] = useActionState(decide.bind(null, id, 'deny'), null);
  const busy = approving || denying;
  const error = approveError ?? denyError;
  return (
    <div>
      <form action={approve} style={{ display: 'inline-block', marginRight: '0.5rem' }}>
        <button type="submit" disabled={busy}>Approve</button>
      </form>
      <form action={deny} style={{ display: 'inline-block' }}>
        <button type="submit" className="ghost" disabled={busy}>Deny</button>
      </form>
      {error ? <p role="alert" className="muted">{error}</p> : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import './EmailChangeFlow.css';

const API_BASE = '/api/email-change';

function IconCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconError() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8v5m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.96L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Reads a `token` query param from the confirmation link and calls the
 * backend to complete the email change. Wire this up to whatever route
 * your app uses for the link, e.g. /confirm-email-change?token=...
 */
export default function ConfirmEmailChange() {
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('This link is missing some information. Please use the link from your email.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'This link is invalid or has expired. Please start the process again.');
          return;
        }

        setStatus('success');
        setNewEmail(data.newEmail || '');
        setMessage(data.message || 'Your email address has been updated.');
      } catch (err) {
        setStatus('error');
        setMessage('We couldn\u2019t reach the server. Please check your connection and try again.');
      }
    })();
  }, []);

  return (
    <div className="ecf">
      <div className="ecf__brand">
        <div className="ecf__brand-mark" aria-hidden="true" />
        <span className="ecf__brand-name">Ubiquity</span>
      </div>
      <div className="ecf__card">
        {status === 'loading' && (
          <>
            <p className="ecf__eyebrow">Change email address</p>
            <h1 className="ecf__title">Confirming your new email…</h1>
            <p className="ecf__body">This will just take a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="ecf__status-icon ecf__status-icon--success">
              <IconCheck />
            </div>
            <h1 className="ecf__title">Email address updated</h1>
            <p className="ecf__body">
              {newEmail ? `Your account is now linked to ${newEmail}.` : message}
              {' '}We've also sent a note to your old email address to let you know this change was made.
            </p>
            <a href="/" className="ecf__button ecf__button--primary" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              Return to sign in
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="ecf__status-icon ecf__status-icon--error">
              <IconError />
            </div>
            <h1 className="ecf__title">We couldn't confirm this change</h1>
            <p className="ecf__body">{message}</p>
            <a href="/change-email" className="ecf__button ecf__button--primary" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              Start again
            </a>
          </>
        )}
      </div>
    </div>
  );
}

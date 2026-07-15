import { useState } from 'react';
import './EmailChangeFlow.css';

// Adjust this if your API base differs in local dev vs production
const API_BASE = '/api/email-change';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_NUMBER_RE = /^C\d{8}$/i;

function BrandHeader() {
  return (
    <div className="ecf__brand">
      <img src="/ubiquity-mark.png" alt="Ubiquity" className="ecf__logo" />
      <span className="ecf__brand-name">Ubiquity</span>
    </div>
  );
}

function FooterNote() {
  return (
    <p className="ecf__footer-note">
      Not sure what to do next? Email us at{' '}
      <a href="mailto:portaladministration@iconvergence.co.uk">portaladministration@iconvergence.co.uk</a>
    </p>
  );
}

function IconCheck() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Step 1 — ask whether the client still has access to their old email inbox.
 */
function ChooseStep({ onChoose }) {
  return (
    <>
      <p className="ecf__eyebrow">Change email address</p>
      <h1 className="ecf__title">Do you still have access to your old email address?</h1>
      <p className="ecf__body">
        We'll use this to confirm it's really you before updating your account.
      </p>
      <div className="ecf__choice-group">
        <button type="button" className="ecf__choice" onClick={() => onChoose('old-email')}>
          Yes, I can still receive emails there
          <span className="ecf__choice-arrow">→</span>
        </button>
        <button type="button" className="ecf__choice" onClick={() => onChoose('identity')}>
          No, I no longer have access to it
          <span className="ecf__choice-arrow">→</span>
        </button>
      </div>
    </>
  );
}

/**
 * Step 2a — verify using the old email address on file.
 */
function OldEmailStep({ onBack, onSubmit, submitting, serverError }) {
  const [oldEmail, setOldEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const next = {};
    if (!EMAIL_RE.test(oldEmail)) next.oldEmail = 'Enter a valid email address.';
    if (!EMAIL_RE.test(newEmail)) next.newEmail = 'Enter a valid email address.';
    if (EMAIL_RE.test(oldEmail) && EMAIL_RE.test(newEmail) && oldEmail.trim().toLowerCase() === newEmail.trim().toLowerCase()) {
      next.newEmail = 'This is the same as your old email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({ method: 'old_email', oldEmail: oldEmail.trim(), newEmail: newEmail.trim() });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="ecf__eyebrow">Change email address</p>
      <h1 className="ecf__title">Confirm your old email address</h1>
      <p className="ecf__body">
        Enter the email address currently on your account, along with the new
        address you'd like to use.
      </p>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="oldEmail">Current email address</label>
        <input
          id="oldEmail"
          type="email"
          className={`ecf__input ${errors.oldEmail ? 'ecf__input--error' : ''}`}
          value={oldEmail}
          onChange={(e) => setOldEmail(e.target.value)}
          autoComplete="email"
        />
        {errors.oldEmail && <p className="ecf__error">{errors.oldEmail}</p>}
      </div>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="newEmail">New email address</label>
        <input
          id="newEmail"
          type="email"
          className={`ecf__input ${errors.newEmail ? 'ecf__input--error' : ''}`}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="email"
        />
        {errors.newEmail && <p className="ecf__error">{errors.newEmail}</p>}
      </div>

      {serverError && <p className="ecf__error">{serverError}</p>}

      <div className="ecf__actions">
        <button type="button" className="ecf__button ecf__button--ghost" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button type="submit" className="ecf__button ecf__button--primary" disabled={submitting}>
          {submitting && <span className="ecf__spinner" />}
          {submitting ? 'Submitting…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

/**
 * Step 2b — verify using name, address and client number, for clients who
 * no longer have access to their old inbox.
 */
function IdentityStep({ onBack, onSubmit, submitting, serverError }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [clientNumber, setClientNumber] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = 'Enter your full name.';
    if (!address.trim()) next.address = 'Enter your address.';
    if (!CLIENT_NUMBER_RE.test(clientNumber.trim())) {
      next.clientNumber = 'Client number should start with C followed by 8 digits, e.g. C12345678.';
    }
    if (!EMAIL_RE.test(newEmail)) next.newEmail = 'Enter a valid email address.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      method: 'identity',
      name: name.trim(),
      address: address.trim(),
      clientNumber: clientNumber.trim().toUpperCase(),
      newEmail: newEmail.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p className="ecf__eyebrow">Change email address</p>
      <h1 className="ecf__title">Confirm your details</h1>
      <p className="ecf__body">
        Since you no longer have access to your old email, we'll check these
        details against our records instead.
      </p>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="name">Full name</label>
        <input
          id="name"
          type="text"
          className={`ecf__input ${errors.name ? 'ecf__input--error' : ''}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        {errors.name && <p className="ecf__error">{errors.name}</p>}
      </div>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="address">Address on file</label>
        <input
          id="address"
          type="text"
          className={`ecf__input ${errors.address ? 'ecf__input--error' : ''}`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="street-address"
        />
        {errors.address && <p className="ecf__error">{errors.address}</p>}
      </div>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="clientNumber">Client number</label>
        <input
          id="clientNumber"
          type="text"
          className={`ecf__input ${errors.clientNumber ? 'ecf__input--error' : ''}`}
          value={clientNumber}
          onChange={(e) => setClientNumber(e.target.value)}
          placeholder="C12345678"
        />
        <p className="ecf__hint">
          This starts with the letter C followed by 8 digits, and can be found
          on your Brite or MN correspondence.
        </p>
        {errors.clientNumber && <p className="ecf__error">{errors.clientNumber}</p>}
      </div>

      <div className="ecf__field">
        <label className="ecf__label" htmlFor="newEmailIdentity">New email address</label>
        <input
          id="newEmailIdentity"
          type="email"
          className={`ecf__input ${errors.newEmail ? 'ecf__input--error' : ''}`}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          autoComplete="email"
        />
        {errors.newEmail && <p className="ecf__error">{errors.newEmail}</p>}
      </div>

      {serverError && <p className="ecf__error">{serverError}</p>}

      <div className="ecf__actions">
        <button type="button" className="ecf__button ecf__button--ghost" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button type="submit" className="ecf__button ecf__button--primary" disabled={submitting}>
          {submitting && <span className="ecf__spinner" />}
          {submitting ? 'Submitting…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}

/**
 * Final step — deliberately generic regardless of whether a match was found
 * on the backend, so the form can't be used to probe which client records
 * exist (account enumeration).
 */
function SentStep({ onRestart }) {
  return (
    <>
      <div className="ecf__status-icon ecf__status-icon--sent">
        <IconCheck />
      </div>
      <h1 className="ecf__title">Check your new inbox</h1>
      <p className="ecf__body">
        If the details you provided match our records, an email is on its way
        to your new address with a link to confirm the change. The link
        expires in 60 minutes.
      </p>
      <p className="ecf__body">
        Didn't get anything after a few minutes? Check your spam folder, or
        start again to double-check your details.
      </p>
      <button type="button" className="ecf__button ecf__button--ghost" onClick={onRestart}>
        Start again
      </button>
    </>
  );
}

export default function EmailChangeFlow() {
  const [step, setStep] = useState('choice'); // choice | old-email | identity | sent
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    setServerError('');
    try {
      const res = await fetch(`${API_BASE}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Only surface genuine input/validation problems here — never
        // whether a matching client record was found or not.
        setServerError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setStep('sent');
    } catch (err) {
      setServerError('We couldn\u2019t reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ecf">
      <BrandHeader />
      <div className="ecf__card">
        {step === 'choice' && <ChooseStep onChoose={setStep} />}
        {step === 'old-email' && (
          <OldEmailStep
            onBack={() => setStep('choice')}
            onSubmit={handleSubmit}
            submitting={submitting}
            serverError={serverError}
          />
        )}
        {step === 'identity' && (
          <IdentityStep
            onBack={() => setStep('choice')}
            onSubmit={handleSubmit}
            submitting={submitting}
            serverError={serverError}
          />
        )}
        {step === 'sent' && <SentStep onRestart={() => { setStep('choice'); setServerError(''); }} />}
      </div>
      <FooterNote />
    </div>
  );
}

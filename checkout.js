// PromptForge AI landing-page checkout — opens Razorpay, sends success to the
// Cloudflare Worker (which verifies the payment server-side and emails the code).
//
// OWNER TODO — set these two values:
//   1. RAZORPAY_KEY_ID — Razorpay Dashboard → Settings → API Keys (rzp_test_… then rzp_live_…)
//   2. WORKER_URL      — your deployed Cloudflare Worker URL

const RAZORPAY_KEY_ID = 'PASTE_YOUR_RAZORPAY_KEY_ID';
const WORKER_URL = 'PASTE_YOUR_WORKER_URL';
const PRICE_RUPEES = 50;

const $ = (s) => document.querySelector(s);
const validEmail = (s) => /\S+@\S+\.\S+/.test(s);
function setStatus(msg, color) { const el = $('#status'); if (el) { el.textContent = msg; el.style.color = color || 'var(--dim)'; } }
function isConfigured() { return !RAZORPAY_KEY_ID.includes('PASTE') && !WORKER_URL.includes('PASTE'); }

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('#buy-btn');
  const emailInput = $('#buyer-email');
  try {
    const email = new URLSearchParams(location.search).get('email');
    if (email && emailInput) emailInput.value = email;
  } catch {}

  btn?.addEventListener('click', async () => {
    if (!isConfigured()) { setStatus('Checkout not configured yet (owner: set keys in checkout.js).', '#fb7185'); return; }
    const email = (emailInput?.value || '').trim();
    if (!validEmail(email)) { setStatus('Enter a valid email — your code goes there.', '#fb7185'); emailInput?.focus(); return; }

    setStatus('Checking your email…');
    btn.disabled = true;
    try {
      const check = await callWorker('check-email', { email });
      if (check?.has_active_pro) {
        const exp = check.expires_at ? new Date(check.expires_at).toLocaleDateString() : '';
        setStatus(`✓ You already have active Pro${exp ? ' (until ' + exp + ')' : ''}. Open the extension → Settings → "Have a code?" and sign in.`, '#34d399');
        btn.disabled = false; return;
      }
    } catch {}
    btn.disabled = false;
    openRazorpay(email);
  });

  emailInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
});

async function callWorker(action, params) {
  const url = new URL(WORKER_URL);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  return res.json();
}

function openRazorpay(email) {
  setStatus('Opening secure checkout…');
  const rzp = new Razorpay({
    key: RAZORPAY_KEY_ID,
    amount: PRICE_RUPEES * 100, // paisa
    currency: 'INR',
    name: 'PromptForge AI Pro',
    description: '3-month Pro subscription · activation code emailed instantly',
    prefill: { email },
    notes: { product: 'promptforge-pro', email },
    theme: { color: '#8b5cf6' },
    handler: (response) => onPaid(response.razorpay_payment_id, email),
    modal: { ondismiss: () => setStatus('Payment cancelled.') }
  });
  rzp.on('payment.failed', (r) => setStatus('Payment failed: ' + (r?.error?.description || 'try again'), '#fb7185'));
  rzp.open();
}

async function onPaid(paymentId, email) {
  setStatus('Payment received! Emailing your activation code…');
  try {
    const data = await callWorker('buy', { paymentId, email });
    if (data?.ok) {
      setStatus('🎉 Done! Check your email for the 6-digit code, then open the extension → Settings → "Have a code?" to unlock Pro.', '#34d399');
    } else {
      setStatus('Payment verified but server error: ' + (data?.error || 'unknown') + '. Email us with payment ID: ' + paymentId, '#fb7185');
    }
  } catch {
    setStatus('Payment went through but we could not reach the server. Email us payment ID: ' + paymentId, '#fb7185');
  }
}

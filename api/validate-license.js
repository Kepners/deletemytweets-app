// Vercel Serverless Function: Validate License Key against Stripe
// POST /api/validate-license
// Body: { "licenseKey": "DMT-XXXX-XXXX-XXXX-XXXX" }

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY);

// License key format validation
function isValidFormat(key) {
  if (!key || key.length !== 23) return false;
  const pattern = /^DMT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(key.toUpperCase());
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, error: 'Method not allowed' });
  }

  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({ valid: false, error: 'License key required' });
    }

    const normalizedKey = licenseKey.toUpperCase().trim();

    // Check format first
    if (!isValidFormat(normalizedKey)) {
      return res.status(400).json({ valid: false, error: 'Invalid license key format' });
    }

    // Search Stripe customers for this license key in metadata
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;

      const customers = await stripe.customers.list(params);

      for (const customer of customers.data) {
        if (customer.metadata && customer.metadata.license_key === normalizedKey) {
          // Found! Check if license is active
          const isActive = customer.metadata.license_status !== 'revoked';

          return res.status(200).json({
            valid: isActive,
            email: customer.email,
            activatedAt: customer.metadata.license_activated_at || null,
            error: isActive ? null : 'License has been revoked'
          });
        }
      }

      hasMore = customers.has_more;
      if (customers.data.length > 0) {
        startingAfter = customers.data[customers.data.length - 1].id;
      }
    }

    // License key not found in any customer
    return res.status(404).json({ valid: false, error: 'License key not found' });

  } catch (err) {
    console.error('License validation error:', err);
    return res.status(500).json({ valid: false, error: 'Validation service error' });
  }
};

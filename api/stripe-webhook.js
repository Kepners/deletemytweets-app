// Vercel Serverless Function: Stripe Webhook Handler
// Generates license keys on successful purchase
// POST /api/stripe-webhook

const Stripe = require('stripe');
const crypto = require('crypto');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Generate a unique license key: DMT-XXXX-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0,O,1,I
  let key = 'DMT';

  for (let group = 0; group < 4; group++) {
    key += '-';
    for (let i = 0; i < 4; i++) {
      key += chars[crypto.randomInt(chars.length)];
    }
  }

  return key;
}

// Raw body parser for webhook signature verification
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      // Only process completed payments
      if (session.payment_status !== 'paid') {
        console.log('Payment not completed, skipping');
        break;
      }

      const customerId = session.customer;
      const customerEmail = session.customer_email || session.customer_details?.email;

      if (!customerId) {
        console.log('No customer ID, skipping');
        break;
      }

      try {
        // Check if customer already has a license key
        const customer = await stripe.customers.retrieve(customerId);

        if (customer.metadata && customer.metadata.license_key) {
          console.log(`Customer ${customerId} already has license: ${customer.metadata.license_key}`);
          break;
        }

        // Generate new license key
        const licenseKey = generateLicenseKey();

        // Store in customer metadata
        await stripe.customers.update(customerId, {
          metadata: {
            license_key: licenseKey,
            license_status: 'active',
            license_activated_at: new Date().toISOString(),
            license_product: session.metadata?.product_name || 'DeleteMyTweets'
          }
        });

        console.log(`Generated license for ${customerEmail}: ${licenseKey}`);

        // Note: Stripe will send the receipt email automatically
        // The license key is stored in metadata and can be retrieved via the validate endpoint
        // For sending the license key via email, you can:
        // 1. Use Stripe's customer portal
        // 2. Add Resend/SendGrid integration here
        // 3. Show it on the success page after checkout

      } catch (err) {
        console.error('Error generating license:', err);
        return res.status(500).json({ error: 'Failed to generate license' });
      }

      break;
    }

    case 'customer.subscription.deleted':
    case 'charge.refunded': {
      // Optionally revoke license on refund/cancellation
      const customerId = event.data.object.customer;

      if (customerId) {
        try {
          await stripe.customers.update(customerId, {
            metadata: {
              license_status: 'revoked',
              license_revoked_at: new Date().toISOString()
            }
          });
          console.log(`Revoked license for customer ${customerId}`);
        } catch (err) {
          console.error('Error revoking license:', err);
        }
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).json({ received: true });
};

// Disable body parsing for raw body access (needed for webhook signature)
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

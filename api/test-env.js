export default function handler(req, res) {
  res.json({
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 10) + '...' : 'MISSING',
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasMfPubKey: !!process.env.MF_PUB_KEY,
    nodeVersion: process.version
  });
}

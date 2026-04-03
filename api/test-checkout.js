import Stripe from "stripe";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price_data: { currency: "eur", product_data: { name: "Test" }, unit_amount: 1490 }, quantity: 1 }],
            mode: "payment",
            customer_email: "test@test.com",
            success_url: "https://contester-amende-sncf.vercel.app/contester-amende-sncf/merci/",
            cancel_url: "https://contester-amende-sncf.vercel.app/",
        });
        return res.status(200).json({ checkout_url: session.url });
    } catch (err) {
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
}

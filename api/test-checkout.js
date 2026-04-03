export default async function handler(req, res) {
    try {
        const sk = process.env.STRIPE_SECRET_KEY;
        const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${sk}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                "payment_method_types[0]": "card",
                "line_items[0][price_data][currency]": "eur",
                "line_items[0][price_data][product_data][name]": "Test contestation SNCF",
                "line_items[0][price_data][unit_amount]": "1490",
                "line_items[0][quantity]": "1",
                "mode": "payment",
                "customer_email": "test@test.com",
                "success_url": "https://contester-amende-sncf.vercel.app/contester-amende-sncf/merci/",
                "cancel_url": "https://contester-amende-sncf.vercel.app/",
            }).toString(),
        });
        const data = await response.json();
        if (data.url) {
            return res.status(200).json({ checkout_url: data.url });
        }
        return res.status(500).json({ error: data.error || data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

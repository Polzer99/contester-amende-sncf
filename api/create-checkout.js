const BASE_URL = "https://contester-amende-sncf.vercel.app";

function buildStripeParams(body) {
    const { prenom, nom, email, adresse, code_postal, ville,
        numero_train, date_trajet, gare_depart, gare_arrivee,
        numero_recu, montant_amende, montant_transport, numero_agent } = body;

    return new URLSearchParams({
        "payment_method_types[0]": "card",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][product_data][name]": "Contestation amende SNCF - Recommandé AR",
        "line_items[0][price_data][product_data][description]": `Reçu ${numero_recu || "N/A"} — génération + envoi LRAR`,
        "line_items[0][price_data][unit_amount]": "1490",
        "line_items[0][quantity]": "1",
        "mode": "payment",
        "customer_email": email || "",
        "metadata[prenom]": prenom || "",
        "metadata[nom]": nom || "",
        "metadata[email]": email || "",
        "metadata[adresse]": adresse || "",
        "metadata[code_postal]": code_postal || "",
        "metadata[ville]": ville || "",
        "metadata[numero_train]": numero_train || "",
        "metadata[date_trajet]": date_trajet || "",
        "metadata[gare_depart]": gare_depart || "",
        "metadata[gare_arrivee]": gare_arrivee || "",
        "metadata[numero_recu]": numero_recu || "",
        "metadata[montant_amende]": montant_amende || "0",
        "metadata[montant_transport]": montant_transport || "0",
        "metadata[numero_agent]": numero_agent || "",
        "success_url": `${BASE_URL}/contester-amende-sncf/merci/?session_id={CHECKOUT_SESSION_ID}`,
        "cancel_url": `${BASE_URL}/contester-amende-sncf/#formulaire`,
    });
}

export default async function handler(req, res) {
    // Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Basic input validation
    const { prenom, nom, email } = req.body || {};
    if (!prenom || !nom || !email) {
        return res.status(400).json({ error: "Missing required fields: prenom, nom, email" });
    }

    try {
        const params = buildStripeParams(req.body);
        const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });
        const session = await response.json();

        if (session.url) {
            return res.status(200).json({ checkout_url: session.url });
        }
        return res.status(500).json({ error: session.error?.message || "Stripe error" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

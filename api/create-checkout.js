import Stripe from "stripe";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const BASE_URL = process.env.BASE_URL || "https://contester-amende-sncf.vercel.app";

    const {
        prenom, nom, email, adresse, code_postal, ville,
        numero_train, date_trajet, gare_depart, gare_arrivee,
        numero_recu, montant_amende, montant_transport, numero_agent,
    } = req.body;

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
            price_data: {
                currency: "eur",
                product_data: {
                    name: "Contestation amende SNCF - Recommande AR",
                    description: `Lettre de reclamation pour le recu ${numero_recu}`,
                },
                unit_amount: 1000,
            },
            quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        metadata: {
            prenom, nom, email, adresse, code_postal, ville,
            numero_train, date_trajet, gare_depart, gare_arrivee,
            numero_recu, montant_amende,
            montant_transport: montant_transport || "0",
            numero_agent: numero_agent || "",
        },
        success_url: `${BASE_URL}/contester-amende-sncf/merci/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/contester-amende-sncf/#formulaire`,
    });

    return res.status(200).json({ checkout_url: session.url });
}

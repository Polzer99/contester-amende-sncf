import crypto from "crypto";

const MF_ID_USER = 31590;
const MF_BASE_URL = "https://www.merci-facteur.com/api/1.2/prod/service";

// --- Helpers ---
function sanitize(str) {
    if (typeof str !== "string") return "";
    return str.replace(/<[^>]*>/g, "").trim().substring(0, 500);
}

function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Stripe: get session + check payment + check idempotency ---
async function getStripeSession(sessionId) {
    const res = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
    );
    return res.json();
}

async function markSessionAsSent(sessionId, envoiId) {
    await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ "metadata[letter_sent]": "true", "metadata[envoi_id]": String(envoiId) }).toString(),
    });
}

// --- Letter generation (modeled on Paul's real winning letter) ---
function generateLetter(d) {
    const p = (s) => escapeHtml(s);
    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const dateTrajet = new Date(d.date_trajet).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const montantTotal = (parseFloat(d.montant_amende || 0) + parseFloat(d.montant_transport || 0)).toFixed(2);

    const agentMention = d.numero_agent
        ? `l'agent ${p(d.numero_agent)} m'a inflig\u00e9 une indemnit\u00e9 forfaitaire`
        : `un agent SNCF m'a inflig\u00e9 une indemnit\u00e9 forfaitaire`;

    const transportDemande = parseFloat(d.montant_transport || 0) > 0
        ? `<br>&mdash; Le remboursement du montant transport de <strong>${p(d.montant_transport)}&nbsp;\u20ac</strong> per\u00e7u dans ce cadre`
        : "";

    const agentEnquete = d.numero_agent
        ? `<br>&mdash; L'ouverture d'une proc\u00e9dure de v\u00e9rification interne concernant les pratiques de l'agent <strong>${p(d.numero_agent)}</strong>`
        : "";

    return `<html><body style="font-family:Arial,sans-serif;font-size:11pt;line-height:1.7;margin:50px;">
<p><strong>${p(d.prenom)} ${p(d.nom)}</strong><br>${p(d.adresse)}<br>${p(d.code_postal)} ${p(d.ville)}<br>${d.email ? p(d.email) : ""}</p>
<p><strong>Service Relation Clients SNCF</strong><br>62 973 ARRAS Cedex 9</p>
<p style="text-align:right;">${p(d.ville)}, le ${today}</p>
<hr>
<p><strong>Objet : Contestation d'une indemnit\u00e9 forfaitaire &ndash; R\u00e9f. re\u00e7u ${p(d.numero_recu)} &ndash; Train n\u00b0${p(d.numero_train)} du ${dateTrajet}</strong></p>
<hr>
<p>Madame, Monsieur,</p>
<p>Le ${dateTrajet}, dans le train n\u00b0${p(d.numero_train)} (${p(d.gare_depart)} \u2192 ${p(d.gare_arrivee)}), ${agentMention} de ${p(d.montant_amende)}&nbsp;\u20ac (re\u00e7u n\u00b0${p(d.numero_recu)}).</p>
<p><strong>Je conteste formellement cette verbalisation pour les raisons suivantes :</strong></p>
<p><strong>1. Absence de base r\u00e9glementaire.</strong> Les Conditions G\u00e9n\u00e9rales de Transport SNCF ne pr\u00e9voient pas de sanction dans les circonstances de mon contr\u00f4le. Aucune disposition ne justifie cette verbalisation.</p>
<p><strong>2. Titre de transport valide et v\u00e9rifiable.</strong> Je disposais d'un titre de transport valide pour ce trajet exact, r\u00e9serv\u00e9 \u00e0 mon nom et accessible via l'application SNCF Connect. L'agent avait les moyens de v\u00e9rifier mon identit\u00e9 et la validit\u00e9 de mon titre par voie num\u00e9rique.</p>
<p><strong>3. Voyageur de bonne foi.</strong> Je suis un voyageur r\u00e9gulier sur ce trajet. Mon historique d'achats SNCF en atteste (pi\u00e8ces disponibles sur demande).</p>
<p><strong>4. Pr\u00e9l\u00e8vement contraint.</strong> Le montant de ${montantTotal}&nbsp;\u20ac a \u00e9t\u00e9 pr\u00e9lev\u00e9 sans possibilit\u00e9 de refus sur le moment (re\u00e7u n\u00b0${p(d.numero_recu)}).</p>
<p><strong>En cons\u00e9quence, je vous demande :</strong></p>
<p>&mdash; Le remboursement int\u00e9gral de l'indemnit\u00e9 forfaitaire de <strong>${p(d.montant_amende)}&nbsp;\u20ac</strong>${transportDemande}${agentEnquete}</p>
<p>\u00c0 d\u00e9faut de r\u00e9ponse satisfaisante sous <strong>30 jours</strong>, je me r\u00e9serve le droit de saisir le <strong>M\u00e9diateur de la SNCF</strong>, puis le tribunal comp\u00e9tent, conform\u00e9ment aux articles L.2141-1 et suivants du Code des transports.</p>
<p><strong>Pi\u00e8ces jointes :</strong></p>
<p>&mdash; Re\u00e7u original n\u00b0 ${p(d.numero_recu)}<br>&mdash; Justificatif de titre de transport</p>
<p>Dans l'attente de votre retour, veuillez agr\u00e9er, Madame, Monsieur, l'expression de mes salutations distingu\u00e9es.</p>
<p style="margin-top:40px;"><strong>${p(d.prenom)} ${p(d.nom)}</strong></p>
</body></html>`;
}

// --- Merci Facteur ---
async function getMfToken() {
    const pubKey = process.env.MF_PUB_KEY;
    const secKey = process.env.MF_SEC_KEY;
    if (!pubKey || !secKey) throw new Error("MF keys not configured");

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", secKey).update(pubKey + timestamp).digest("hex");
    const ip = await fetch("https://api.ipify.org").then((r) => r.text());

    const res = await fetch(`${MF_BASE_URL}/getToken`, {
        headers: { "ww-service-id": pubKey, "ww-service-signature": signature, "ww-timestamp": String(timestamp), "ww-authorized-ip": ip },
    });
    const data = await res.json();
    if (!data.success) throw new Error(`MF token failed: ${data.error?.text}`);
    return { token: data.token, pubKey };
}

function buildMfPayload(letterBase64, data) {
    return {
        idUser: MF_ID_USER,
        modeEnvoi: "lrar",
        adress: {
            exp: { civilite: "M", nom: sanitize(data.nom), prenom: sanitize(data.prenom), societe: "", adresse1: sanitize(data.adresse), adresse2: "", adresse3: "", cp: sanitize(data.code_postal), ville: sanitize(data.ville), pays: "France", phone: "", email: sanitize(data.email) },
            dest: [{ civilite: "", nom: "", prenom: "", societe: "Service Relation Clients SNCF", adresse1: "BP 20649", adresse2: "", adresse3: "", cp: "62973", ville: "Arras Cedex 9", pays: "France", phone: "", email: "" }],
        },
        content: { letter: { base64files: [letterBase64], final_filename: `contestation_sncf_${data.numero_recu}`, print_sides: "recto" } },
    };
}

async function sendLrar(token, pubKey, letterBase64, data) {
    const payload = buildMfPayload(letterBase64, data);
    const formData = new FormData();
    formData.append("idUser", String(MF_ID_USER));
    formData.append("modeEnvoi", "lrar");
    formData.append("adress", JSON.stringify(payload.adress));
    formData.append("content", JSON.stringify(payload.content));

    const res = await fetch(`${MF_BASE_URL}/sendCourrier`, {
        method: "POST",
        headers: { "ww-service-id": pubKey, "ww-access-token": token },
        body: formData,
    });
    return res.json();
}

// --- Main handler ---
export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "session_id required" });

    try {
        // 1. Get Stripe session + verify payment
        const session = await getStripeSession(session_id);
        if (session.payment_status !== "paid") {
            return res.status(403).json({ error: "Payment not completed" });
        }

        // 2. Idempotency: check if already sent
        if (session.metadata?.letter_sent === "true") {
            return res.status(200).json({ success: true, already_sent: true, envoi_id: session.metadata.envoi_id, message: "Lettre déjà envoyée" });
        }

        // 3. Extract data from Stripe metadata
        const d = session.metadata;

        // 4. Generate letter
        const letterHtml = generateLetter(d);
        const letterBase64 = Buffer.from(letterHtml).toString("base64");

        // 5. Send via Merci Facteur
        const { token, pubKey } = await getMfToken();
        const result = await sendLrar(token, pubKey, letterBase64, d);

        if (result.success) {
            const envoiId = result.envoi_id?.[0] || result.envoi_id;
            await markSessionAsSent(session_id, envoiId);
            return res.status(200).json({ success: true, envoi_id: envoiId, price: result.price });
        }

        return res.status(500).json({ success: false, error: result.error?.text || "Merci Facteur error" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

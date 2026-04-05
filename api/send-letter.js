import crypto from "crypto";

const MF_ID_USER = 31590;
const MF_BASE_URL = "https://www.merci-facteur.com/api/1.2/prod/service";

const DESTINATAIRE_SNCF = {
    nom: "Service Relation Clients SNCF",
    adresse: "",
    codePostal: "62973",
    ville: "ARRAS Cedex 9",
    pays: "FR",
};

// --- SECURITY: Input sanitization ---
function sanitizeHtml(str) {
    if (typeof str !== "string") return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sanitizeInput(str) {
    if (typeof str !== "string") return "";
    // Remove any HTML tags and limit length
    return str.replace(/<[^>]*>/g, "").trim().substring(0, 500);
}

function validatePostalCode(cp) {
    return /^\d{5}$/.test(cp);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- SECURITY: Verify Stripe payment before sending ---
async function verifyStripePayment(sessionId) {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY || !sessionId) return false;

    try {
        const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
            headers: {
                "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
            },
        });
        const session = await res.json();
        return session.payment_status === "paid";
    } catch {
        return false;
    }
}

function generateLetterHtml(data) {
    // Sanitize all user inputs before injecting into HTML
    const prenom = sanitizeHtml(data.prenom);
    const nom = sanitizeHtml(data.nom);
    const adresse = sanitizeHtml(data.adresse);
    const code_postal = sanitizeHtml(data.code_postal);
    const ville = sanitizeHtml(data.ville);
    const numero_train = sanitizeHtml(data.numero_train);
    const date_trajet = sanitizeHtml(data.date_trajet);
    const gare_depart = sanitizeHtml(data.gare_depart);
    const gare_arrivee = sanitizeHtml(data.gare_arrivee);
    const numero_recu = sanitizeHtml(data.numero_recu);
    const montant_amende = sanitizeHtml(data.montant_amende);
    const montant_transport = sanitizeHtml(data.montant_transport);
    const numero_agent = sanitizeHtml(data.numero_agent);

    const dateFormatted = new Date(data.date_trajet).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
    });
    const today = new Date().toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
    });

    const agentLine = numero_agent
        ? `L'agent portant le numero ${numero_agent} m'a alors dresse un proces-verbal.`
        : `Un agent m'a alors dresse un proces-verbal.`;

    const transportLine = montant_transport && parseFloat(data.montant_transport) > 0
        ? ` ainsi que le remboursement du montant transport de ${montant_transport} euros`
        : "";

    return `
<html>
<body style="font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 40px;">
<p style="text-align: right;">
${prenom} ${nom}<br>
${adresse}<br>
${code_postal} ${ville}
</p>

<p style="text-align: right; margin-top: 20px;">${today}</p>

<p style="margin-top: 30px;">
Service Relation Clients SNCF<br>
62 973 ARRAS Cedex 9
</p>

<p style="margin-top: 20px;"><strong>Objet : Contestation de l'indemnite forfaitaire — Recu n${"\u00B0"}${numero_recu}</strong></p>

<p>Madame, Monsieur,</p>

<p>Par la presente, je me permets de contester l'indemnite forfaitaire qui m'a ete infligee le ${dateFormatted}, a bord du train n${"\u00B0"}${numero_train} reliant ${gare_depart} a ${gare_arrivee}.</p>

<p>${agentLine} Le montant de l'indemnite forfaitaire s'eleve a ${montant_amende} euros (recu n${"\u00B0"}${numero_recu}).</p>

<p>Je conteste cette verbalisation pour les raisons suivantes :</p>
<ul>
<li>Je disposais d'un titre de transport valide pour ce trajet, que je n'ai pas ete en mesure de presenter dans les conditions exigees lors du controle.</li>
<li>Les conditions de controle ne m'ont pas permis de faire valoir mes droits de maniere equitable.</li>
</ul>

<p>Conformement aux articles L.2141-1 et L.2241-2 du Code des transports, ainsi qu'aux Conditions Generales de Transport SNCF Voyageurs, je vous demande l'annulation pure et simple de cette indemnite forfaitaire et le remboursement integral de la somme de ${montant_amende} euros${transportLine}.</p>

<p>Je vous rappelle que le Reglement europeen n${"\u00B0"}1371/2007 relatif aux droits et obligations des voyageurs ferroviaires prevoit un traitement equitable des reclamations.</p>

<p>A defaut de reponse favorable dans un delai de 30 jours, je me reserverai le droit de saisir le Mediateur SNCF conformement a l'article L.612-1 du Code de la consommation, ainsi que toute juridiction competente.</p>

<p>Dans l'attente de votre reponse, je vous prie d'agreer, Madame, Monsieur, l'expression de mes salutations distinguees.</p>

<p style="margin-top: 30px;">${prenom} ${nom}</p>
</body>
</html>`;
}

async function getMfToken() {
    const pubKey = process.env.MF_PUB_KEY;
    const secKey = process.env.MF_SEC_KEY;

    if (!pubKey || !secKey) {
        throw new Error("MF_PUB_KEY or MF_SEC_KEY not configured");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
        .createHmac("sha256", secKey)
        .update(pubKey + timestamp)
        .digest("hex");

    const ipRes = await fetch("https://api.ipify.org");
    const ip = await ipRes.text();

    const res = await fetch(`${MF_BASE_URL}/getToken`, {
        method: "GET",
        headers: {
            "ww-service-id": pubKey,
            "ww-service-signature": signature,
            "ww-timestamp": String(timestamp),
            "ww-authorized-ip": ip,
        },
    });

    const data = await res.json();
    if (!data.success) {
        throw new Error(`Merci Facteur getToken failed: ${JSON.stringify(data)}`);
    }
    return { token: data.token, pubKey };
}

async function sendLrar(token, pubKey, formData) {
    const letterHtml = generateLetterHtml(formData);
    const letterBase64 = Buffer.from(letterHtml).toString("base64");

    const expediteur = {
        civilite: "mr",
        prenom: formData.prenom,
        nom: formData.nom,
        adresse: formData.adresse,
        codePostal: formData.code_postal,
        ville: formData.ville,
        pays: "FR",
    };

    const payload = {
        idUser: MF_ID_USER,
        modeEnvoi: "lrar",
        adress: {
            exp: expediteur,
            dest: [DESTINATAIRE_SNCF],
        },
        content: {
            letter: {
                base64files: [letterBase64],
                final_filename: `contestation_sncf_${formData.nom}_${formData.numero_recu}`,
                print_sides: "recto",
            },
        },
    };

    const res = await fetch(`${MF_BASE_URL}/sendCourrier`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "ww-service-id": pubKey,
            "ww-access-token": token,
        },
        body: new URLSearchParams({ json: JSON.stringify(payload) }).toString(),
    });

    return res.json();
}

export default async function handler(req, res) {
    // Security headers
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // --- SECURITY: Verify Stripe payment ---
    const { stripe_session_id } = req.body;
    if (!stripe_session_id) {
        return res.status(403).json({ error: "Payment required. No session ID provided." });
    }

    const isPaid = await verifyStripePayment(stripe_session_id);
    if (!isPaid) {
        return res.status(403).json({ error: "Payment not verified. Please complete payment first." });
    }

    // --- Sanitize and validate inputs ---
    const prenom = sanitizeInput(req.body.prenom);
    const nom = sanitizeInput(req.body.nom);
    const email = sanitizeInput(req.body.email);
    const adresse = sanitizeInput(req.body.adresse);
    const code_postal = sanitizeInput(req.body.code_postal);
    const ville = sanitizeInput(req.body.ville);
    const numero_train = sanitizeInput(req.body.numero_train);
    const date_trajet = sanitizeInput(req.body.date_trajet);
    const gare_depart = sanitizeInput(req.body.gare_depart);
    const gare_arrivee = sanitizeInput(req.body.gare_arrivee);
    const numero_recu = sanitizeInput(req.body.numero_recu);
    const montant_amende = sanitizeInput(req.body.montant_amende);
    const montant_transport = sanitizeInput(req.body.montant_transport) || "0";
    const numero_agent = sanitizeInput(req.body.numero_agent) || "";

    if (!prenom || !nom || !adresse || !code_postal || !ville || !numero_recu) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (!validatePostalCode(code_postal)) {
        return res.status(400).json({ error: "Invalid postal code format" });
    }

    if (email && !validateEmail(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    try {
        const { token, pubKey } = await getMfToken();
        const formData = {
            prenom, nom, email, adresse, code_postal, ville,
            numero_train, date_trajet, gare_depart, gare_arrivee,
            numero_recu, montant_amende, montant_transport, numero_agent,
        };
        const result = await sendLrar(token, pubKey, formData);

        if (result.success) {
            return res.status(200).json({
                success: true,
                envoi_id: result.envoi_id,
                message: "Lettre LRAR envoyee avec succes",
            });
        }
        return res.status(500).json({
            success: false,
            error: "Merci Facteur send failed",
            details: result,
        });
    } catch (err) {
        return res.status(500).json({
            error: "Send letter failed",
            message: err.message,
        });
    }
}

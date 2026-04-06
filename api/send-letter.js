import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MF_ID_USER = 31590;
const MF_BASE_URL = "https://www.merci-facteur.com/api/1.2/prod/service";

// --- Helpers ---
function s(str) {
    if (typeof str !== "string") return "";
    return str.replace(/<[^>]*>/g, "").trim().substring(0, 500);
}

// --- Stripe ---
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
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ "metadata[letter_sent]": "true", "metadata[envoi_id]": String(envoiId) }).toString(),
    });
}

// --- PDF Generation ---
function buildLetterLines(d) {
    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const dateTrajet = new Date(d.date_trajet).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const montantTotal = (parseFloat(d.montant_amende || 0) + parseFloat(d.montant_transport || 0)).toFixed(2);
    const agent = d.numero_agent ? `l'agent ${d.numero_agent}` : "un agent SNCF";

    const lines = [
        `${s(d.prenom)} ${s(d.nom)}`,
        s(d.adresse),
        `${s(d.code_postal)} ${s(d.ville)}`,
        d.email ? s(d.email) : "",
        "",
        "Service Relation Clients SNCF",
        "62 973 ARRAS Cedex 9",
        "",
        `${s(d.ville)}, le ${today}`,
        "",
        `Objet : Contestation d'une indemnite forfaitaire - Ref. recu ${s(d.numero_recu)} - Train n${s(d.numero_train)} du ${dateTrajet}`,
        "",
        "Madame, Monsieur,",
        "",
        `Le ${dateTrajet}, dans le train n${s(d.numero_train)} (${s(d.gare_depart)} > ${s(d.gare_arrivee)}), ${agent} m'a inflige une indemnite forfaitaire de ${s(d.montant_amende)} EUR (recu n${s(d.numero_recu)}).`,
        "",
        "Je conteste formellement cette verbalisation pour les raisons suivantes :",
        "",
        "1. Absence de base reglementaire. Les Conditions Generales de Transport SNCF ne prevoient pas de sanction dans les circonstances de mon controle. Aucune disposition ne justifie cette verbalisation.",
        "",
        "2. Titre de transport valide et verifiable. Je disposais d'un titre de transport valide pour ce trajet exact, reserve a mon nom et accessible via l'application SNCF Connect. L'agent avait les moyens de verifier mon identite et la validite de mon titre par voie numerique.",
        "",
        "3. Voyageur de bonne foi. Je suis un voyageur regulier sur ce trajet. Mon historique d'achats SNCF en atteste (pieces disponibles sur demande).",
        "",
        `4. Prelevement contraint. Le montant de ${montantTotal} EUR a ete preleve sans possibilite de refus sur le moment (recu n${s(d.numero_recu)}).`,
        "",
        "En consequence, je vous demande :",
        `- Le remboursement integral de l'indemnite forfaitaire de ${s(d.montant_amende)} EUR`,
    ];

    if (parseFloat(d.montant_transport || 0) > 0) {
        lines.push(`- Le remboursement du montant transport de ${s(d.montant_transport)} EUR`);
    }
    if (d.numero_agent) {
        lines.push(`- L'ouverture d'une procedure de verification concernant l'agent ${s(d.numero_agent)}`);
    }

    lines.push(
        "",
        "A defaut de reponse satisfaisante sous 30 jours, je me reserve le droit de saisir le Mediateur de la SNCF, puis le tribunal competent, conformement aux articles L.2141-1 et suivants du Code des transports.",
        "",
        "Pieces jointes :",
        `- Recu original n ${s(d.numero_recu)}`,
        "- Justificatif de titre de transport",
        "",
        "Dans l'attente de votre retour, veuillez agreer, Madame, Monsieur, l'expression de mes salutations distinguees.",
        "",
        "",
        `${s(d.prenom)} ${s(d.nom)}`
    );

    return lines;
}

async function generatePdf(d) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 10;
    const lineHeight = 14;
    const margin = 50;
    const lines = buildLetterLines(d);

    let page = pdf.addPage([595, 842]); // A4
    let y = 842 - margin;

    for (const line of lines) {
        if (y < margin + 20) {
            page = pdf.addPage([595, 842]);
            y = 842 - margin;
        }
        const isTitle = line.startsWith("Objet :");
        const isBold = isTitle || line.startsWith("En consequence") || line.startsWith("Pieces jointes");
        const usedFont = isBold ? fontBold : font;

        // Word wrap
        const maxWidth = 595 - 2 * margin;
        const words = line.split(" ");
        let currentLine = "";

        for (const word of words) {
            const test = currentLine ? currentLine + " " + word : word;
            if (usedFont.widthOfTextAtSize(test, fontSize) > maxWidth) {
                page.drawText(currentLine, { x: margin, y, size: fontSize, font: usedFont, color: rgb(0, 0, 0) });
                y -= lineHeight;
                if (y < margin + 20) { page = pdf.addPage([595, 842]); y = 842 - margin; }
                currentLine = word;
            } else {
                currentLine = test;
            }
        }
        if (currentLine) {
            page.drawText(currentLine, { x: margin, y, size: fontSize, font: usedFont, color: rgb(0, 0, 0) });
        }
        y -= lineHeight;
    }

    return Buffer.from(await pdf.save()).toString("base64");
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

async function sendLrar(token, pubKey, pdfBase64, data) {
    const formData = new FormData();
    formData.append("idUser", String(MF_ID_USER));
    formData.append("modeEnvoi", "lrar");
    formData.append("adress", JSON.stringify({
        exp: { civilite: "M", nom: s(data.nom), prenom: s(data.prenom), societe: "", adresse1: s(data.adresse), adresse2: "", adresse3: "", cp: s(data.code_postal), ville: s(data.ville), pays: "France", phone: "", email: s(data.email) },
        dest: [{ civilite: "", nom: "", prenom: "", societe: "Service Relation Clients SNCF", adresse1: "BP 20649", adresse2: "", adresse3: "", cp: "62973", ville: "Arras Cedex 9", pays: "France", phone: "", email: "" }],
    }));
    formData.append("content", JSON.stringify({
        letter: { base64files: [pdfBase64], final_filename: `contestation_sncf_${data.numero_recu}`, print_sides: "recto" },
    }));

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
        const session = await getStripeSession(session_id);
        if (session.payment_status !== "paid") {
            return res.status(403).json({ error: "Payment not completed" });
        }
        if (session.metadata?.letter_sent === "true") {
            return res.status(200).json({ success: true, already_sent: true, envoi_id: session.metadata.envoi_id });
        }

        const d = session.metadata;
        const pdfBase64 = await generatePdf(d);
        const { token, pubKey } = await getMfToken();
        const result = await sendLrar(token, pubKey, pdfBase64, d);

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

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "API key not configured" });
    }

    try {
        const { image, mediaType } = req.body;

        if (!image) {
            return res.status(400).json({ error: "No image provided" });
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1024,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: mediaType || "image/jpeg",
                                    data: image,
                                },
                            },
                            {
                                type: "text",
                                text: `Analyse cette photo d'un recu/PV d'amende SNCF. Extrais les informations suivantes au format JSON strict (sans markdown, sans backticks, juste le JSON) :

{
    "numero_recu": "le numero/reference du recu (ex: pC243303445)",
    "date_trajet": "la date au format YYYY-MM-DD",
    "numero_train": "le numero du train (ex: 7038)",
    "gare_depart": "la gare de depart",
    "gare_arrivee": "la gare d'arrivee",
    "montant_amende": "le montant de l'indemnite forfaitaire en euros (nombre uniquement)",
    "montant_transport": "le montant du transport en euros (nombre uniquement, 0 si non trouve)",
    "numero_agent": "le numero/code de l'agent (ex: AN364)",
    "nom_voyageur": "le nom du voyageur si visible",
    "prenom_voyageur": "le prenom du voyageur si visible"
}

Si une information n'est pas lisible ou absente, mets une chaine vide "". Reponds UNIQUEMENT avec le JSON, rien d'autre.`,
                            },
                        ],
                    },
                ],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(500).json({ error: "Claude API error", details: data });
        }

        const text = data.content[0].text.trim();
        const extracted = JSON.parse(text);

        return res.status(200).json(extracted);
    } catch (err) {
        return res.status(500).json({ error: "Extraction failed", message: err.message });
    }
}

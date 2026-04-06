import crypto from "crypto";

export default async function handler(req, res) {
    const pubKey = process.env.MF_PUB_KEY;
    const secKey = process.env.MF_SEC_KEY;

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", secKey).update(pubKey + timestamp).digest("hex");
    const ip = await fetch("https://api.ipify.org").then(r => r.text());

    const tokenRes = await fetch("https://www.merci-facteur.com/api/1.2/prod/service/getToken", {
        headers: {
            "ww-service-id": pubKey,
            "ww-service-signature": signature,
            "ww-timestamp": String(timestamp),
            "ww-authorized-ip": ip,
        },
    });
    const data = await tokenRes.json();

    res.json({
        pubKeyLen: pubKey?.length,
        secKeyLen: secKey?.length,
        pubKeyStart: pubKey?.substring(0, 15),
        secKeyStart: secKey?.substring(0, 15),
        timestamp,
        ip,
        sigLen: signature.length,
        tokenResponse: data,
    });
}

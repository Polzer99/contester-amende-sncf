import os
import json
import stripe
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs


stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
BASE_URL = os.getenv("BASE_URL", "https://contester-amende-sncf.vercel.app")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")

        # Parse form data
        params = parse_qs(body)
        def get(key, default=""):
            values = params.get(key, [default])
            return values[0] if values else default

        prenom = get("prenom")
        nom = get("nom")
        email = get("email")
        adresse = get("adresse")
        code_postal = get("code_postal")
        ville = get("ville")
        numero_train = get("numero_train")
        date_trajet = get("date_trajet")
        gare_depart = get("gare_depart")
        gare_arrivee = get("gare_arrivee")
        numero_recu = get("numero_recu")
        montant_amende = get("montant_amende")
        montant_transport = get("montant_transport", "0")
        numero_agent = get("numero_agent", "")

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {
                        "name": "Contestation amende SNCF - Recommande AR",
                        "description": f"Lettre de reclamation pour le recu {numero_recu}",
                    },
                    "unit_amount": 1000,
                },
                "quantity": 1,
            }],
            mode="payment",
            customer_email=email,
            metadata={
                "prenom": prenom,
                "nom": nom,
                "email": email,
                "adresse": adresse,
                "code_postal": code_postal,
                "ville": ville,
                "numero_train": numero_train,
                "date_trajet": date_trajet,
                "gare_depart": gare_depart,
                "gare_arrivee": gare_arrivee,
                "numero_recu": numero_recu,
                "montant_amende": montant_amende,
                "montant_transport": montant_transport,
                "numero_agent": numero_agent,
            },
            success_url=f"{BASE_URL}/contester-amende-sncf/merci?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{BASE_URL}/contester-amende-sncf#formulaire",
        )

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"checkout_url": session.url}).encode())

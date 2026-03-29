import os
import sys
import json
import stripe
from http.server import BaseHTTPRequestHandler

# Add api/ to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length)
        sig_header = self.headers.get("stripe-signature", "")

        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid signature"}).encode())
            return

        if event["type"] == "checkout.session.completed":
            from generate_pdf import generate_reclamation
            from send_letter import send_recommande

            session = event["data"]["object"]
            order = session["metadata"]

            pdf_path = f"/tmp/reclamation_{session['id']}.pdf"
            generate_reclamation(order, pdf_path)

            result = send_recommande(order, pdf_path)
            print(f"[OK] Contestation envoyee — session {session['id']} : {result}")

            os.remove(pdf_path)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())

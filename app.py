import os
import stripe
from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Resolve paths relative to this file (works on Vercel + local)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Static files — served by Vercel in prod, by FastAPI in local dev
static_dir = os.path.join(BASE_DIR, "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


@app.get("/contester-amende-sncf", response_class=HTMLResponse)
async def landing(request: Request):
    return templates.TemplateResponse("landing.html", {
        "request": request,
        "stripe_key": STRIPE_PUBLISHABLE_KEY,
    })


@app.post("/api/create-checkout")
async def create_checkout(
    prenom: str = Form(...),
    nom: str = Form(...),
    email: str = Form(...),
    adresse: str = Form(...),
    code_postal: str = Form(...),
    ville: str = Form(...),
    numero_train: str = Form(...),
    date_trajet: str = Form(...),
    gare_depart: str = Form(...),
    gare_arrivee: str = Form(...),
    numero_recu: str = Form(...),
    montant_amende: str = Form(...),
    montant_transport: str = Form("0"),
    numero_agent: str = Form(""),
    details_supplementaires: str = Form(""),
):
    # Store ALL form data in Stripe metadata (serverless = no local state)
    # Stripe metadata values must be strings, max 500 chars each
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "eur",
                "product_data": {
                    "name": "Contestation amende SNCF - Recommande AR",
                    "description": f"Lettre de reclamation pour le recu {numero_recu}",
                },
                "unit_amount": 1000,  # 10,00 EUR
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

    return JSONResponse({"checkout_url": session.url})


@app.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        from generate_pdf import generate_reclamation
        from send_letter import send_recommande

        session = event["data"]["object"]
        order = session["metadata"]

        # Generate PDF in /tmp (only writable dir on serverless)
        pdf_path = f"/tmp/reclamation_{session['id']}.pdf"
        generate_reclamation(order, pdf_path)

        # Send via Merci Facteur
        result = send_recommande(order, pdf_path)
        print(f"[OK] Contestation envoyee — session {session['id']} : {result}")

        # Cleanup
        os.remove(pdf_path)

    return JSONResponse({"status": "ok"})


@app.get("/contester-amende-sncf/merci", response_class=HTMLResponse)
async def merci(request: Request):
    return templates.TemplateResponse("merci.html", {"request": request})

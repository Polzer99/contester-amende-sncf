import os
import base64
import requests
from dotenv import load_dotenv

load_dotenv()

PUB_KEY = os.getenv("MF_PUB_KEY")
SEC_KEY = os.getenv("MF_SEC_KEY")
SANDBOX = os.getenv("MF_SANDBOX", "true").lower() == "true"
BASE_URL = "https://www.merci-facteur.com/api/1.2"


def send_recommande(data: dict, pdf_path: str) -> dict:
    with open(pdf_path, "rb") as f:
        pdf_b64 = base64.b64encode(f.read()).decode()

    payload = {
        "typeCourrier": "lrar",
        "sandbox": SANDBOX,
        "expediteur": {
            "nom": data["nom"].upper(),
            "prenom": data["prenom"],
            "adresse": data["adresse"],
            "codePostal": data["code_postal"],
            "ville": data["ville"],
            "pays": "FR",
        },
        "destinataire": {
            "nom": "Service Relation Clients SNCF",
            "adresse": "62 973 ARRAS Cedex 9",
            "codePostal": "62973",
            "ville": "Arras",
            "pays": "FR",
        },
        "fichier": pdf_b64,
        "nomFichier": "reclamation_sncf.pdf",
    }

    response = requests.post(
        f"{BASE_URL}/sendCourrier",
        headers={
            "pub_key": PUB_KEY,
            "sec_key": SEC_KEY,
            "Content-Type": "application/json",
        },
        json=payload,
    )

    result = response.json()
    mode = "SANDBOX" if SANDBOX else "PRODUCTION"
    print(f"[Merci Facteur] {mode} — HTTP {response.status_code} — {result}")
    return result

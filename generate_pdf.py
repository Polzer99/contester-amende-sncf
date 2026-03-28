from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_JUSTIFY, TA_RIGHT
from datetime import datetime


def generate_reclamation(data: dict, output_path: str):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2.5 * cm, rightMargin=2.5 * cm,
        topMargin=2.5 * cm, bottomMargin=2.5 * cm,
    )

    normal = ParagraphStyle("n", fontName="Helvetica", fontSize=10, leading=15, spaceAfter=6, alignment=TA_JUSTIFY)
    bold = ParagraphStyle("b", fontName="Helvetica-Bold", fontSize=10, leading=15, spaceAfter=6)
    right = ParagraphStyle("r", fontName="Helvetica", fontSize=10, leading=14, alignment=TA_RIGHT)
    red = ParagraphStyle("rb", fontName="Helvetica-Bold", fontSize=10, leading=15, textColor=colors.HexColor("#c8102e"))

    prenom = data["prenom"]
    nom = data["nom"]
    ville = data["ville"]
    code_postal = data["code_postal"]
    adresse = data["adresse"]
    numero_train = data["numero_train"]
    date_trajet = data["date_trajet"]
    gare_depart = data["gare_depart"]
    gare_arrivee = data["gare_arrivee"]
    numero_recu = data["numero_recu"]
    montant_amende = data["montant_amende"]
    montant_transport = data.get("montant_transport", "0")
    numero_agent = data.get("numero_agent", "")
    email = data.get("email", "")

    today = datetime.now().strftime("%d/%m/%Y")
    montant_total = float(montant_amende) + float(montant_transport)

    s = []

    # Expediteur
    s.append(Paragraph(f"{prenom} {nom.upper()}", bold))
    s.append(Paragraph(f"{adresse}", normal))
    s.append(Paragraph(f"{code_postal} {ville}", normal))
    if email:
        s.append(Paragraph(email, normal))
    s.append(Spacer(1, 0.4 * cm))

    # Destinataire
    s.append(Paragraph("Service Relation Clients SNCF", bold))
    s.append(Paragraph("62 973 ARRAS Cedex 9", normal))
    s.append(Spacer(1, 0.3 * cm))

    s.append(Paragraph(f"{ville}, le {today}", right))
    s.append(Spacer(1, 0.4 * cm))

    # Objet
    s.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#c8102e"), spaceAfter=8))
    agent_ref = f" – Agent {numero_agent}" if numero_agent else ""
    s.append(Paragraph(
        f"<b>Objet : Contestation d'une indemnite forfaitaire – "
        f"Ref. recu {numero_recu} – Train n{numero_train} du {date_trajet}{agent_ref}</b>", red))
    s.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#c8102e"), spaceBefore=8, spaceAfter=14))

    s.append(Paragraph("Madame, Monsieur,", normal))
    s.append(Spacer(1, 0.3 * cm))

    # Corps
    agent_mention = f"l'agent {numero_agent}" if numero_agent else "un agent SNCF"
    s.append(Paragraph(
        f"Le {date_trajet}, dans le train n{numero_train} ({gare_depart} – {gare_arrivee}), "
        f"{agent_mention} m'a inflige une indemnite forfaitaire de {montant_amende} EUR.", normal))

    s.append(Paragraph("<b>Je conteste formellement cette verbalisation pour les raisons suivantes :</b>", bold))
    s.append(Spacer(1, 0.2 * cm))

    s.append(Paragraph(
        "<b>1. Absence de base reglementaire.</b> Les Conditions Generales de Transport SNCF ne prevoient "
        "pas l'obligation de presenter une piece d'identite physique en complement d'une carte commerciale "
        "valide lors d'un controle ordinaire. Aucune disposition ne justifie cette verbalisation.", normal))

    s.append(Paragraph(
        "<b>2. Billet nominatif valide et verifiable numeriquement.</b> Je disposais d'un billet nominatif "
        f"valide pour ce trajet exact ({gare_depart} – {gare_arrivee}), "
        f"reserve a mon nom {prenom.upper()} {nom.upper()} et accessible en temps reel via l'application SNCF Connect. "
        "L'agent avait tous les moyens de verifier mon identite et mon titre par voie numerique.", normal))

    s.append(Paragraph(
        "<b>3. Voyageur de bonne foi.</b> Je suis un voyageur regulier de bonne foi. "
        "Mon historique d'achats SNCF et mes releves bancaires en attestent.", normal))

    if float(montant_transport) > 0:
        s.append(Paragraph(
            f"<b>4. Prelevement contraint.</b> Le montant total de {montant_total:.2f} EUR "
            f"({montant_transport} EUR transport + {montant_amende} EUR indemnite) "
            f"a ete preleve le {date_trajet} sans possibilite de refus sur le moment.", normal))

    s.append(Spacer(1, 0.3 * cm))
    s.append(Paragraph("<b>En consequence, je demande :</b>", bold))
    s.append(Paragraph(f"— Le remboursement integral de l'indemnite forfaitaire de <b>{montant_amende} EUR</b>", normal))
    if float(montant_transport) > 0:
        s.append(Paragraph(f"— Le remboursement du montant transport de <b>{montant_transport} EUR</b>", normal))
    if numero_agent:
        s.append(Paragraph(
            f"— L'ouverture d'une procedure de verification interne concernant les pratiques de l'agent <b>{numero_agent}</b>, "
            "dont le comportement constitue une application abusive des procedures de controle", normal))

    s.append(Spacer(1, 0.4 * cm))
    s.append(Paragraph(
        "A defaut de reponse satisfaisante sous <b>30 jours</b>, je me reserve le droit de saisir le "
        "<b>Mediateur de la SNCF</b>, puis le tribunal competent pour remboursement et prejudice subi, "
        "conformement aux articles L.2141-1 et suivants du Code des transports.", normal))

    s.append(Spacer(1, 0.4 * cm))
    s.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=8))
    s.append(Paragraph("<b>Pieces jointes :</b>", bold))
    s.append(Paragraph(f"— Recu original n {numero_recu} ({montant_total:.2f} EUR)", normal))
    s.append(Paragraph(f"— Capture billet nominatif SNCF Connect ({gare_depart} – {gare_arrivee})", normal))

    s.append(Spacer(1, 0.6 * cm))
    s.append(Paragraph(
        "Dans l'attente de votre retour, veuillez agreer, Madame, Monsieur, "
        "l'expression de mes salutations distinguees.", normal))
    s.append(Spacer(1, 0.8 * cm))
    s.append(Paragraph(f"<b>{prenom} {nom.upper()}</b>", bold))

    doc.build(s)
    return output_path

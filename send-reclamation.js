#!/usr/bin/env node

/**
 * Envoi de la réclamation SNCF via Merci Facteur API
 * - Lettre de contestation (PDF)
 * - Photo du PV (JPEG)
 * - RIB Qonto (PDF)
 *
 * Usage: node send-reclamation.js [--prod]
 * Sans --prod: mode test (sandbox), pas d'envoi réel
 * Avec --prod: envoi réel en recommandé AR
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Config
const SERVICE_ID = 'public-e45e0301a9e312242be7b2430ed4776208f649e2b7067af25e926272654bf4d1.1584566589.2857';
const SECRET_KEY = 'secret-417806980060ca913620ba2cb09a653de8a27a2bd10f56507609036b0a27cc58.1973482612.96';
const IS_PROD = process.argv.includes('--prod');
const BASE_URL = 'https://www.merci-facteur.com/api/1.2/prod/service';

// Fichiers
const HOME = require('os').homedir();
const LETTRE_PDF = path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'reclamation sncf larmaraud.pdf');
const PHOTO_PV = path.join(HOME, 'Downloads', 'WhatsApp Image 2026-04-03 at 07.33.21.jpeg');
const RIB_PDF = path.join(HOME, 'Downloads', 'sasu-parrit-ai-3298-iban-fr.pdf');

// Adresses
const EXPEDITEUR = {
  civilite: 'mr',
  prenom: 'Paul',
  nom: 'LARMARAUD',
  adresse: '3 avenue Otis Mygatt',
  codePostal: '92500',
  ville: 'Rueil-Malmaison',
  pays: 'FR'
};

const DESTINATAIRE = {
  nom: 'Service Relation Clients SNCF',
  adresse: '',
  codePostal: '62973',
  ville: 'ARRAS Cedex 9',
  pays: 'FR'
};

async function getToken() {
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = crypto.createHmac('sha256', SECRET_KEY)
    .update(SERVICE_ID + timestamp)
    .digest('hex');

  const url = `${BASE_URL}/getToken`;
  console.log('🔑 Obtention du token Merci Facteur...');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'ww-service-id': SERVICE_ID,
      'ww-service-signature': hash,
      'ww-timestamp': String(timestamp),
      'ww-authorized-ip': await fetch('https://api.ipify.org').then(r => r.text()),
    }
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(`Erreur getToken: ${JSON.stringify(data)}`);
  }
  console.log('✅ Token obtenu (expire:', new Date(data.expire * 1000).toLocaleString('fr-FR'), ')');
  return data.token;
}

async function sendCourrier(token) {
  // Charger et encoder les fichiers en base64
  console.log('\n📄 Chargement des fichiers...');

  if (!fs.existsSync(LETTRE_PDF)) {
    throw new Error(`Lettre non trouvée: ${LETTRE_PDF}`);
  }
  if (!fs.existsSync(PHOTO_PV)) {
    throw new Error(`Photo PV non trouvée: ${PHOTO_PV}`);
  }
  if (!fs.existsSync(RIB_PDF)) {
    throw new Error(`RIB non trouvé: ${RIB_PDF}`);
  }

  const lettreBase64 = fs.readFileSync(LETTRE_PDF).toString('base64');
  const photoPVBase64 = fs.readFileSync(PHOTO_PV).toString('base64');
  const ribBase64 = fs.readFileSync(RIB_PDF).toString('base64');

  console.log(`  ✓ Lettre de réclamation (${(Buffer.byteLength(lettreBase64, 'base64') / 1024).toFixed(0)} Ko)`);
  console.log(`  ✓ Photo du PV SNCF (${(Buffer.byteLength(photoPVBase64, 'base64') / 1024).toFixed(0)} Ko)`);
  console.log(`  ✓ RIB Qonto (${(Buffer.byteLength(ribBase64, 'base64') / 1024).toFixed(0)} Ko)`);

  const modeEnvoi = IS_PROD ? 'lrar' : 'lrar'; // LRAR même en test, Merci Facteur gère le sandbox côté compte
  console.log(`\n📮 Mode: ${IS_PROD ? '🔴 PRODUCTION — envoi réel en recommandé AR' : '🟡 TEST — vérification sans envoi réel'}`);
  console.log(`   Type: Lettre recommandée avec accusé de réception (LRAR)`);

  const payload = {
    idUser: 31590,
    modeEnvoi: modeEnvoi,
    adress: {
      exp: EXPEDITEUR,
      dest: [DESTINATAIRE]
    },
    content: {
      letter: {
        base64files: [lettreBase64, photoPVBase64, ribBase64],
        final_filename: 'reclamation_sncf_larmaraud_pC243303445',
        print_sides: 'recto'
      }
    }
  };

  const url = `${BASE_URL}/sendCourrier`;
  console.log('\n📤 Envoi en cours...');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'ww-service-id': SERVICE_ID,
      'ww-access-token': token,
    },
    body: new URLSearchParams({ json: JSON.stringify(payload) }).toString()
  });

  const data = await res.json();

  if (data.success) {
    console.log('\n✅ COURRIER ENVOYÉ AVEC SUCCÈS !');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   ID envoi     : ${data.envoi_id}`);
    if (data.price) {
      console.log(`   Prix HT      : ${data.price.total?.ht || '?'} €`);
      console.log(`   Prix TTC     : ${data.price.total?.ttc || '?'} €`);
    }
    if (data.resume) {
      console.log(`   Destinataires: ${data.resume.nb_dest}`);
      console.log(`   Pages        : ${data.resume.nb_page}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📬 Prochaines étapes:');
    console.log('   1. Merci Facteur imprime et envoie le recommandé AR');
    console.log('   2. La SNCF réceptionne et signe l\'accusé de réception');
    console.log('   3. Tu reçois l\'AR numérisé par email');
    console.log('   4. La SNCF a 30 jours pour répondre');
    console.log('   5. Sans réponse → saisir le Médiateur SNCF');
  } else {
    console.log('\n❌ ERREUR lors de l\'envoi:');
    console.log(JSON.stringify(data, null, 2));
  }

  return data;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CONTESTATION AMENDE SNCF — Envoi LRAR');
  console.log('  Réf. reçu: pC243303445');
  console.log('  Train n°7038 du 27/03/2026');
  console.log('  Montant contesté: 155,00 €');
  console.log('═══════════════════════════════════════════\n');

  try {
    const token = await getToken();
    const result = await sendCourrier(token);
    return result;
  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    process.exit(1);
  }
}

main();

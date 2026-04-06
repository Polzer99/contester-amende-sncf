document.addEventListener('DOMContentLoaded', function () {
    // === ELEMENTS ===
    var heroSection = document.getElementById('hero');
    var step1 = document.getElementById('step-1');
    var step2 = document.getElementById('step-2');
    var step3 = document.getElementById('step-3');
    var uploadZone = document.getElementById('upload-zone');
    var fileInput = document.getElementById('ticket-photo');
    var scanPreview = document.getElementById('scan-preview');
    var scanImg = document.getElementById('scan-img');
    var scanStatus = document.getElementById('scan-status');
    var scanError = document.getElementById('scan-error');
    var extractedFields = document.getElementById('extracted-fields');
    var confirmBtn = document.getElementById('confirm-btn');
    var correctBtn = document.getElementById('correct-btn');
    var step2Form = document.getElementById('step2-form');
    var payBtnEl = document.getElementById('pay-btn');
    var payBtnText = document.getElementById('pay-btn-text');
    var allSteps = [heroSection, step1, step2, step3];

    var extractedData = {};

    // === UTILITIES ===
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function getFieldValue(id) {
        return document.getElementById(id).value;
    }

    // === NAVIGATION ===
    function showStep(stepEl) {
        allSteps.forEach(function (s) {
            if (s) s.classList.remove('active');
        });
        if (heroSection && stepEl !== heroSection) {
            heroSection.style.display = 'none';
        }
        if (stepEl === heroSection) {
            heroSection.style.display = '';
        }
        stepEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetToStart() {
        extractedData = {};
        fileInput.value = '';
        scanImg.src = '';
        extractedFields.innerHTML = '';
        confirmBtn.hidden = true;
        correctBtn.hidden = true;
        scanError.hidden = true;
        scanStatus.hidden = true;
        showStep(heroSection);
    }

    // === "RETOUR" BUTTONS — inject into step1, step2, step3 ===
    function addBackButton(stepEl, label, action) {
        var existing = stepEl.querySelector('.back-btn');
        if (existing) return;
        var btn = document.createElement('button');
        btn.className = 'back-btn';
        btn.textContent = label;
        btn.style.cssText = 'background:none; border:1px solid #333; color:#888; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:0.9rem; margin-top:16px; display:block;';
        btn.addEventListener('click', action);
        btn.addEventListener('mouseover', function() { btn.style.color = '#fff'; btn.style.borderColor = '#6366f1'; });
        btn.addEventListener('mouseout', function() { btn.style.color = '#888'; btn.style.borderColor = '#333'; });
        stepEl.appendChild(btn);
    }

    addBackButton(step1, '\u2190 Reprendre une photo', resetToStart);
    addBackButton(step2, '\u2190 Reprendre une photo', resetToStart);
    addBackButton(step3, '\u2190 Modifier mes informations', function() { showStep(step2); });

    // === UPLOAD: DRAG & DROP ===
    uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', function () {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        var file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    });

    uploadZone.addEventListener('click', function () {
        fileInput.click();
    });

    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) {
            processImage(fileInput.files[0]);
        }
    });

    // === IMAGE PROCESSING ===
    function resetScanUI() {
        scanPreview.classList.add('scanning');
        scanStatus.hidden = false;
        scanError.hidden = true;
        extractedFields.innerHTML = '';
        confirmBtn.hidden = true;
        correctBtn.hidden = true;
    }

    function isValidPV(data) {
        return data && (data.numero_recu || data.montant_amende || data.numero_train);
    }

    function showNotPVError() {
        scanPreview.classList.remove('scanning');
        scanStatus.hidden = true;
        scanError.hidden = false;
        scanError.innerHTML = '<p style="color:#f87171; font-weight:600; margin-bottom:8px;">Cette photo ne semble pas \u00eatre un PV SNCF</p><p style="color:#888; font-size:0.9rem;">Prenez une photo claire de votre re\u00e7u d\u2019amende SNCF et r\u00e9essayez.</p>';
    }

    async function callExtractAPI(base64Data, mediaType) {
        var response = await fetch('/api/extract-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data, mediaType: mediaType }),
        });
        var data = await response.json();
        if (response.ok && !data.error) return data;
        return null;
    }

    async function onImageLoaded(result, mediaType) {
        var base64Data = result.split(',')[1];
        try {
            var data = await callExtractAPI(base64Data, mediaType);
            if (data && isValidPV(data)) {
                extractedData = data;
                scanPreview.classList.remove('scanning');
                scanStatus.hidden = true;
                showExtractedFields(data);
            } else {
                showNotPVError();
            }
        } catch (err) {
            console.error('Extraction error:', err);
            showNotPVError();
        }
    }

    function processImage(file) {
        showStep(step1);
        resetScanUI();

        var reader = new FileReader();
        reader.onload = function (e) {
            scanImg.src = e.target.result;
            onImageLoaded(e.target.result, file.type || 'image/jpeg');
        };
        reader.readAsDataURL(file);
    }

    // === EXTRACTED FIELDS DISPLAY ===
    var FIELD_DEFINITIONS = [
        { key: 'numero_recu', label: 'N\u00b0 de re\u00e7u' },
        { key: 'date_trajet', label: 'Date du trajet' },
        { key: 'numero_train', label: 'Train' },
        { key: 'gare_depart', label: 'Gare d\u00e9part', suffix: 'gare_arrivee', separator: ' \u2192 ' },
        { key: 'montant_amende', label: 'Amende', suffix_text: ' \u20ac' },
        { key: 'montant_transport', label: 'Transport', suffix_text: ' \u20ac' },
        { key: 'numero_agent', label: 'Agent' },
    ];

    function buildFieldValue(field, data) {
        var value = data[field.key] || '';
        if (!value) return null;
        if (field.suffix && data[field.suffix]) {
            value = value + field.separator + data[field.suffix];
        }
        if (field.suffix_text) value = value + field.suffix_text;
        return value;
    }

    function createFieldElement(label, value) {
        var div = document.createElement('div');
        div.className = 'extracted-field';
        div.innerHTML =
            '<div>' +
                '<div class="field-label">' + label + '</div>' +
                '<div class="field-value">' + escapeHtml(value) + '</div>' +
            '</div>' +
            '<span class="field-check">&#10003;</span>';
        return div;
    }

    function animateFieldIn(div, delay) {
        setTimeout(function () { div.classList.add('visible'); }, delay);
        setTimeout(function () {
            var check = div.querySelector('.field-check');
            if (check) check.classList.add('pop');
        }, delay + 200);
    }

    function showExtractedFields(data) {
        extractedFields.innerHTML = '';
        var visibleCount = 0;

        FIELD_DEFINITIONS.forEach(function (field) {
            var value = buildFieldValue(field, data);
            if (!value) return;
            var div = createFieldElement(field.label, value);
            extractedFields.appendChild(div);
            animateFieldIn(div, visibleCount * 200);
            visibleCount++;
        });

        setTimeout(function () {
            confirmBtn.hidden = false;
            correctBtn.hidden = false;
        }, visibleCount * 200 + 400);
    }

    // === CONFIRM / CORRECT ===
    confirmBtn.addEventListener('click', function () {
        if (extractedData.prenom_voyageur) {
            document.getElementById('prenom').value = extractedData.prenom_voyageur;
        }
        if (extractedData.nom_voyageur) {
            document.getElementById('nom').value = extractedData.nom_voyageur;
        }
        showStep(step2);
    });

    correctBtn.addEventListener('click', function () {
        showStep(step2);
    });

    // === STEP 2: FORM → SUMMARY ===
    step2Form.addEventListener('submit', function (e) {
        e.preventDefault();
        showStep(step3);
        buildSummary();
    });

    function buildSummary() {
        var trajet = '';
        if (extractedData.gare_depart && extractedData.gare_arrivee) {
            trajet = extractedData.gare_depart + ' \u2192 ' + extractedData.gare_arrivee;
        }
        var rows = [
            { label: 'Re\u00e7u', value: extractedData.numero_recu || '-' },
            { label: 'Date', value: extractedData.date_trajet || '-' },
            { label: 'Trajet', value: trajet || '-' },
            { label: 'Amende', value: extractedData.montant_amende ? extractedData.montant_amende + ' \u20ac' : '-' },
            { label: 'Nom', value: getFieldValue('prenom') + ' ' + getFieldValue('nom') },
        ];

        var summaryBody = document.getElementById('summary-body');
        summaryBody.innerHTML = '';
        rows.forEach(function (row) {
            var div = document.createElement('div');
            div.className = 'summary-row';
            div.innerHTML =
                '<span class="summary-label">' + row.label + '</span>' +
                '<span class="summary-value">' + escapeHtml(row.value) + '</span>';
            summaryBody.appendChild(div);
        });
    }

    // === STEP 3: PAY → STRIPE ===
    function buildPayload() {
        var adresseVal = getFieldValue('adresse');
        var codPostal = '';
        var ville = '';
        var cpMatch = adresseVal.match(/\b(\d{5})\b/);
        if (cpMatch) {
            codPostal = cpMatch[1];
            var afterCp = adresseVal.substring(adresseVal.indexOf(cpMatch[1]) + 5).trim();
            afterCp = afterCp.replace(/^[,\-\s]+/, '');
            if (afterCp) ville = afterCp;
        }

        return {
            prenom: getFieldValue('prenom'),
            nom: getFieldValue('nom'),
            email: getFieldValue('email'),
            adresse: adresseVal,
            code_postal: codPostal,
            ville: ville,
            numero_train: extractedData.numero_train || '',
            date_trajet: extractedData.date_trajet || '',
            gare_depart: extractedData.gare_depart || '',
            gare_arrivee: extractedData.gare_arrivee || '',
            numero_recu: extractedData.numero_recu || '',
            montant_amende: extractedData.montant_amende || '',
            montant_transport: extractedData.montant_transport || '0',
            numero_agent: extractedData.numero_agent || '',
        };
    }

    function resetPayButton() {
        payBtnEl.disabled = false;
        payBtnText.textContent = 'Envoyer ma contestation \u00b7 14,90 \u20ac';
    }

    async function handlePayment() {
        payBtnEl.disabled = true;
        payBtnText.innerHTML = '<span class="spinner spinner-white"></span> Redirection...';

        try {
            var response = await fetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });
            var data = await response.json();

            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error(data.error || 'Pas de lien de paiement');
            }
        } catch (err) {
            resetPayButton();
            alert('Une erreur est survenue. Veuillez r\u00e9essayer.');
            console.error(err);
        }
    }

    payBtnEl.addEventListener('click', handlePayment);
});

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('contestation-form');
    const submitBtn = document.getElementById('submit-btn');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('ticket-photo');
    const uploadContent = document.getElementById('upload-content');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const uploadStatus = document.getElementById('upload-status');
    const uploadSuccess = document.getElementById('upload-success');
    const uploadError = document.getElementById('upload-error');

    // === DRAG & DROP ===
    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', function() {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    });

    // === CLICK TO UPLOAD ===
    uploadZone.addEventListener('click', function(e) {
        if (e.target.id !== 'upload-btn' && e.target.tagName !== 'BUTTON') {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', function() {
        if (fileInput.files[0]) {
            processImage(fileInput.files[0]);
        }
    });

    // === PROCESS IMAGE ===
    async function processImage(file) {
        // Show preview
        uploadContent.hidden = true;
        uploadPreview.hidden = false;
        uploadSuccess.hidden = true;
        uploadError.hidden = true;
        uploadStatus.hidden = false;

        const reader = new FileReader();
        reader.onload = async function(e) {
            previewImg.src = e.target.result;

            // Extract base64 data (remove data:image/xxx;base64, prefix)
            const base64Full = e.target.result;
            const base64Data = base64Full.split(',')[1];
            const mediaType = file.type || 'image/jpeg';

            try {
                const response = await fetch('/api/extract-ticket', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64Data, mediaType: mediaType }),
                });

                const data = await response.json();

                if (response.ok && !data.error) {
                    fillForm(data);
                    uploadStatus.hidden = true;
                    uploadSuccess.hidden = false;
                } else {
                    uploadStatus.hidden = true;
                    uploadError.hidden = false;
                }
            } catch (err) {
                console.error('Extraction error:', err);
                uploadStatus.hidden = true;
                uploadError.hidden = false;
            }
        };
        reader.readAsDataURL(file);
    }

    // === AUTO-FILL FORM ===
    function fillForm(data) {
        const mapping = {
            'numero_recu': 'numero_recu',
            'date_trajet': 'date_trajet',
            'numero_train': 'numero_train',
            'gare_depart': 'gare_depart',
            'gare_arrivee': 'gare_arrivee',
            'montant_amende': 'montant_amende',
            'montant_transport': 'montant_transport',
            'numero_agent': 'numero_agent',
            'nom_voyageur': 'nom',
            'prenom_voyageur': 'prenom',
        };

        for (const [apiKey, formId] of Object.entries(mapping)) {
            const value = data[apiKey];
            if (value && value.trim() !== '') {
                const input = document.getElementById(formId);
                if (input) {
                    input.value = value;
                    input.classList.add('field-autofilled');
                    // Remove highlight after 3s
                    setTimeout(() => input.classList.remove('field-autofilled'), 3000);
                }
            }
        }

        // Scroll to form fields
        document.getElementById('prenom').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // === FORM SUBMIT → STRIPE ===
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Redirection vers le paiement...';

        // Collect form data as JSON
        const formData = new FormData(form);
        const payload = {};
        formData.forEach((value, key) => { payload[key] = value; });

        try {
            const response = await fetch('/api/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error(data.error || 'Pas de lien de paiement recu');
            }
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Payer 20 \u20AC et envoyer ma contestation';
            alert('Une erreur est survenue. Veuillez reessayer.');
            console.error(err);
        }
    });
});

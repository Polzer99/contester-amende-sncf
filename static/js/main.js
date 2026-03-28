document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('contestation-form');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Disable button + spinner
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Redirection vers le paiement...';

        const formData = new FormData(form);

        try {
            const response = await fetch('/api/create-checkout', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                throw new Error('Pas de lien de paiement recu');
            }
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Payer 10 \u20AC et envoyer ma contestation';
            alert('Une erreur est survenue. Veuillez reessayer.');
            console.error(err);
        }
    });
});

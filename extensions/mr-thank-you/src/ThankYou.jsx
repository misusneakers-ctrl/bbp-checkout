// Page de remerciement — choix du point relais Mondial Relay (remplace l'appli Mondial Relay).
// Affiché uniquement si la livraison choisie est Mondial Relay.
//  - point déjà choisi dans le panier → rappel du point ;
//  - sinon → bouton vers /pages/point-relais (carte Mondial Relay officielle), qui enregistre le point
//    sur la commande via bbp-webhook. Preuve : numéro de confirmation, que seule l'acheteuse voit.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

const PAGE = 'https://www.bonsbaisers.paris/pages/point-relais';

export default function extension() {
  render(<Extension />, document.body);
}

function isMondialRelay(groups) {
  return (groups || []).some((g) => {
    const sel = g.selectedDeliveryOption && g.selectedDeliveryOption.handle;
    const opt = (g.deliveryOptions || []).find((o) => o.handle === sel);
    return /mondial\s*relay/i.test((opt && (opt.title || opt.description)) || '');
  });
}

function attr(list, key) {
  const a = (list || []).find((x) => x.key === key);
  return a ? a.value : '';
}

function Extension() {
  const conf = shopify.orderConfirmation.value;
  const groups = shopify.deliveryGroups.value;
  const attrs = shopify.attributes.value;

  if (!isMondialRelay(groups)) return null;

  const orderId = conf && conf.order && conf.order.id ? String(conf.order.id).split('/').pop() : '';
  const number = conf && conf.number ? conf.number : '';
  const url = orderId && number ? `${PAGE}?o=${encodeURIComponent(orderId)}&c=${encodeURIComponent(number)}` : '';

  // Point déjà choisi dans le panier : on le rappelle, avec un bouton pour le changer
  // (changement accepté par bbp-webhook pendant l'heure qui suit la commande).
  const id = attr(attrs, 'mondial_relay_id');
  if (id) {
    return (
      <s-banner tone="success" heading="Votre point relais Mondial Relay">
        <s-stack gap="base">
          <s-text>
            {attr(attrs, 'mondial_relay_name')} — {attr(attrs, 'mondial_relay_address')},{' '}
            {attr(attrs, 'mondial_relay_zip')} {attr(attrs, 'mondial_relay_city')}
          </s-text>
          {url ? (
            <s-button variant="secondary" href={url} target="_blank">
              Changer de point relais
            </s-button>
          ) : null}
        </s-stack>
      </s-banner>
    );
  }

  if (!url) {
    return (
      <s-banner tone="warning" heading="Choisissez votre point relais Mondial Relay">
        <s-text>Vous allez recevoir dans quelques minutes un e-mail pour choisir votre point relais.</s-text>
      </s-banner>
    );
  }

  return (
    <s-banner tone="warning" heading="Choisissez votre point relais Mondial Relay">
      <s-stack gap="base">
        <s-text>
          Pour que nous puissions expédier votre commande, indiquez le point relais où vous souhaitez la retirer.
        </s-text>
        <s-button variant="primary" href={url} target="_blank">
          Choisir mon point relais
        </s-button>
        <s-text color="subdued">Déjà fait ? Vous pouvez ignorer ce message.</s-text>
      </s-stack>
    </s-banner>
  );
}

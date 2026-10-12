// Page de remerciement — choix du point relais Mondial Relay DIRECTEMENT dans la page
// (remplace l'appli Mondial Relay). Affiché uniquement si la livraison choisie est Mondial Relay.
//  - point déjà choisi (panier) → rappel du point + « Changer » (pendant l'heure qui suit la commande) ;
//  - sinon → liste des points proches du code postal de livraison, choix, validation.
// Données et enregistrement : bbp-webhook (/api/mondial-relay/points et /order-point).
// Preuve : numéro de confirmation de la commande, que seule l'acheteuse voit.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const API = 'https://bbp-webhook.vercel.app/api/mondial-relay';
const PAGE = 'https://www.bonsbaisers.paris/pages/point-relais';
const JOURS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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

function adresse(p) {
  return `${p.address}, ${p.zip} ${p.city}`;
}

function horairesDuJour(p) {
  const h = p.hours && p.hours[JOURS[new Date().getDay()]];
  if (!h) return '';
  return h === 'Closed' ? "Fermé aujourd'hui" : `Aujourd'hui : ${h}`;
}

function Extension() {
  const conf = shopify.orderConfirmation.value;
  const groups = shopify.deliveryGroups.value;
  const attrs = shopify.attributes.value;
  const mr = isMondialRelay(groups);

  const orderId = conf && conf.order && conf.order.id ? String(conf.order.id).split('/').pop() : '';
  const number = conf && conf.number ? conf.number : '';
  const proof = orderId && number ? `o=${encodeURIComponent(orderId)}&c=${encodeURIComponent(number)}` : '';

  // Point connu tout de suite (choisi dans le panier) : affiché avant même la réponse du serveur.
  const cartPoint = attr(attrs, 'mondial_relay_id')
    ? {
        id: attr(attrs, 'mondial_relay_id'),
        name: attr(attrs, 'mondial_relay_name'),
        address: attr(attrs, 'mondial_relay_address'),
        zip: attr(attrs, 'mondial_relay_zip'),
        city: attr(attrs, 'mondial_relay_city'),
      }
    : null;

  const [state, setState] = useState(null); // réponse de /order-point
  const [phase, setPhase] = useState('chargement'); // chargement | vu | choix | enregistrement | erreur
  const [zip, setZip] = useState('');
  const [points, setPoints] = useState(null);
  const [recherche, setRecherche] = useState(false);
  const [choisi, setChoisi] = useState('');
  const [message, setMessage] = useState('');

  async function chercher(cp) {
    if (!/^\d{5}$/.test(cp || '')) { setMessage('Indiquez un code postal à 5 chiffres.'); return; }
    setRecherche(true); setMessage('');
    try {
      const r = await fetch(`${API}/points?zip=${cp}&n=8`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setPoints(d.points); setChoisi(d.points[0] ? d.points[0].id : '');
      if (!d.points.length) setMessage('Aucun point relais trouvé autour de ce code postal.');
    } catch (e) {
      setMessage((e && e.message) || 'Recherche indisponible, réessayez.');
    }
    setRecherche(false);
  }

  useEffect(() => {
    if (!mr || !proof) return;
    let essais = 0;
    let stop = false;
    async function charger() {
      try {
        const r = await fetch(`${API}/order-point?${proof}`);
        const d = await r.json();
        if (stop) return;
        if (!d.ok && d.retry && essais < 15) { essais++; setTimeout(charger, 2000); return; }
        if (!d.ok) { setPhase('erreur'); setMessage(d.error || ''); return; }
        setState(d);
        setZip(d.zip || '');
        if (d.hasPoint) { setPhase('vu'); return; }
        if (d.canChoose) { setPhase('choix'); chercher(d.zip); return; }
        setPhase('vu');
      } catch (e) {
        if (!stop && essais < 15) { essais++; setTimeout(charger, 2000); return; }
        if (!stop) setPhase('erreur');
      }
    }
    charger();
    return () => { stop = true; };
  }, [mr, proof]);

  async function valider() {
    const p = (points || []).find((x) => x.id === choisi);
    if (!p) return;
    setPhase('enregistrement'); setMessage('');
    try {
      const r = await fetch(`${API}/order-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ o: orderId, c: number, point: p }),
      });
      const d = await r.json();
      if (!d.ok) { setMessage(d.error || 'Erreur, réessayez.'); setPhase('choix'); return; }
      setState(d); setPhase('vu');
    } catch (e) {
      setMessage('Erreur de connexion, réessayez dans un instant.'); setPhase('choix');
    }
  }

  if (!mr) return null;

  const point = (state && state.point) || cartPoint;

  // Point enregistré.
  if ((phase === 'vu' || (phase === 'chargement' && cartPoint)) && point) {
    return (
      <s-banner tone="success" heading="Votre point relais Mondial Relay">
        <s-stack gap="base">
          <s-text><s-text type="strong">{point.name}</s-text> — {adresse(point)}</s-text>
          {state && state.canChange ? (
            <s-button variant="secondary" onClick={() => { setPhase('choix'); chercher(zip || point.zip); }}>
              Changer de point relais
            </s-button>
          ) : null}
        </s-stack>
      </s-banner>
    );
  }

  if (phase === 'chargement') {
    return (
      <s-banner tone="info" heading="Point relais Mondial Relay">
        <s-stack direction="inline" gap="base"><s-spinner /><s-text>Chargement des points relais…</s-text></s-stack>
      </s-banner>
    );
  }

  if (phase === 'vu' && !point && state && (state.shipped || state.cancelled)) {
    return (
      <s-banner tone="info" heading="Point relais Mondial Relay">
        <s-text>Votre commande est déjà en préparation. Pour toute question sur le point relais, répondez simplement à l’e-mail de confirmation.</s-text>
      </s-banner>
    );
  }

  if (phase === 'erreur' || !proof || (phase === 'vu' && !point)) {
    return (
      <s-banner tone="warning" heading="Choisissez votre point relais Mondial Relay">
        <s-stack gap="base">
          <s-text>{message || 'Le choix du point relais n’a pas pu s’afficher ici.'}</s-text>
          {proof ? (
            <s-button variant="primary" href={`${PAGE}?${proof}`} target="_blank">Choisir sur la carte</s-button>
          ) : (
            <s-text>Vous allez recevoir un e-mail pour choisir votre point relais.</s-text>
          )}
        </s-stack>
      </s-banner>
    );
  }

  // Choix.
  return (
    <s-banner tone="warning" heading={state && state.hasPoint ? 'Changer de point relais' : 'Choisissez votre point relais Mondial Relay'}>
      <s-stack gap="base">
        {!(state && state.hasPoint) ? (
          <s-text>Pour que nous puissions expédier votre commande, choisissez le point relais où la retirer.</s-text>
        ) : null}
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field
            label="Code postal"
            value={zip}
            maxLength={5}
            onInput={(e) => setZip(String(e.currentTarget.value || '').replace(/\D/g, '').slice(0, 5))}
          />
          <s-button variant="secondary" loading={recherche} onClick={() => chercher(zip)}>Rechercher</s-button>
        </s-stack>
        {message ? <s-text tone="critical">{message}</s-text> : null}
        {points && points.length ? (
          <s-choice-list name="point-relais" onChange={(e) => setChoisi((e.currentTarget.values || [])[0] || '')}>
            {points.map((p) => (
              <s-choice value={p.id} selected={p.id === choisi}>
                {p.name}{p.locker ? ' · Locker 24/7' : ''}
                <s-text slot="details">{adresse(p)}{horairesDuJour(p) ? ` — ${horairesDuJour(p)}` : ''}</s-text>
              </s-choice>
            ))}
          </s-choice-list>
        ) : null}
        {points && points.length ? (
          <s-button variant="primary" loading={phase === 'enregistrement'} onClick={valider}>
            Valider ce point relais
          </s-button>
        ) : null}
        <s-link href={`${PAGE}?${proof}`} target="_blank">Voir les points sur une carte</s-link>
      </s-stack>
    </s-banner>
  );
}

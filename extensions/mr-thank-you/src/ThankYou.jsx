// Page de remerciement — choix du point relais Mondial Relay dans une FENÊTRE (pop-in), comme dans
// le panier : recherche par code postal, carte avec les points numérotés, liste avec horaires.
// Affiché uniquement si la livraison choisie est Mondial Relay.
//  - point déjà choisi (panier) → rappel du point + « Changer de point relais » (dans l'heure qui suit) ;
//  - sinon → bandeau « Choisissez votre point relais » + bouton qui ouvre la fenêtre.
// Données et enregistrement : bbp-webhook (/api/mondial-relay/points et /order-point).
// Preuve : numéro de confirmation de la commande, que seule l'acheteuse voit.
// Carte : composant Shopify (Google Maps). Clé « Carte point relais - page de remerciement Shopify »
// du projet Google « Bons baisers de Paname », limitée à l'API Maps JavaScript et aux domaines
// bonsbaisers.paris / Shopify : elle est visible dans la page par nature, mais inutilisable ailleurs.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const API = 'https://bbp-webhook.vercel.app/api/mondial-relay';
const PAGE = 'https://www.bonsbaisers.paris/pages/point-relais';
const MAPS_KEY = 'AIzaSyAzslLku1q9jdWP4M7bSQzypW1f_Di8SvU';
const MODAL_ID = 'bbp-mr-fenetre';
const JOURS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SEMAINE = [['monday', 'Lun'], ['tuesday', 'Mar'], ['wednesday', 'Mer'], ['thursday', 'Jeu'], ['friday', 'Ven'], ['saturday', 'Sam'], ['sunday', 'Dim']];

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

function horaire(h) {
  if (!h) return '—';
  return h === 'Closed' ? 'Fermé' : h;
}

function horairesDuJour(p) {
  const h = p.hours && p.hours[JOURS[new Date().getDay()]];
  if (!h) return '';
  return h === 'Closed' ? "Fermé aujourd'hui" : `Aujourd'hui : ${h}`;
}

// Centre et zoom pour voir tous les points (la carte Shopify n'a pas de « fitBounds »).
function cadrage(points) {
  const pts = (points || []).filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLng = Math.max(maxLng - minLng, 0.002);
  const spanLat = Math.max(maxLat - minLat, 0.002);
  // ~560 × 300 px utiles, tuiles de 256 px, marge de 30 %.
  const zLng = Math.log2((560 / 256) * 360 / (spanLng * 1.3));
  const zLat = Math.log2((300 / 256) * 170 / (spanLat * 1.3));
  const zoom = Math.max(5, Math.min(16, Math.floor(Math.min(zLng, zLat))));
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, zoom };
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

  const modal = useRef(null);
  const [state, setState] = useState(null); // réponse de /order-point
  const [phase, setPhase] = useState('chargement'); // chargement | vu | choix | erreur
  const [zip, setZip] = useState('');
  const [points, setPoints] = useState(null);
  const [recherche, setRecherche] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [choisi, setChoisi] = useState('');
  const [message, setMessage] = useState('');
  const [vue, setVue] = useState(null); // centre/zoom de la carte

  async function chercher(cp, idActuel) {
    if (!/^\d{5}$/.test(cp || '')) { setMessage('Indiquez un code postal à 5 chiffres.'); return; }
    setRecherche(true); setMessage('');
    try {
      const r = await fetch(`${API}/points?zip=${cp}&n=10`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setPoints(d.points);
      setVue(cadrage(d.points));
      const garde = idActuel || choisi || (state && state.point && state.point.id);
      const actuel = garde && d.points.find((p) => p.id === garde);
      setChoisi(actuel ? actuel.id : (d.points[0] ? d.points[0].id : ''));
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
        // Les points sont chargés d'avance : la fenêtre s'ouvre déjà remplie.
        if (d.canChoose || d.canChange) chercher((d.point && d.point.zip) || d.zip, d.point && d.point.id);
        if (d.hasPoint) { setPhase('vu'); return; }
        if (d.canChoose) { setPhase('choix'); return; }
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
    if (!p) { setMessage('Choisissez un point relais dans la liste.'); return; }
    setEnregistrement(true); setMessage('');
    try {
      const r = await fetch(`${API}/order-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ o: orderId, c: number, point: p }),
      });
      const d = await r.json();
      setEnregistrement(false);
      if (!d.ok) { setMessage(d.error || 'Erreur, réessayez.'); return; }
      setState(d); setPhase('vu');
      if (modal.current && modal.current.hideOverlay) modal.current.hideOverlay();
    } catch (e) {
      setEnregistrement(false);
      setMessage('Erreur de connexion, réessayez dans un instant.');
    }
  }

  if (!mr) return null;

  const point = (state && state.point) || cartPoint;
  const selection = (points || []).find((p) => p.id === choisi);

  // --- La fenêtre (pop-in) ---
  const fenetre = (
    <s-modal id={MODAL_ID} ref={modal} heading="Choisissez votre point relais Mondial Relay" size="large">
      <s-stack gap="base">
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field
            label="Code postal"
            value={zip}
            maxLength={5}
            onInput={(e) => {
              const v = String(e.currentTarget.value || '').replace(/\D/g, '').slice(0, 5);
              setZip(v);
              if (v.length === 5) chercher(v);
            }}
          />
          <s-button variant="secondary" loading={recherche} onClick={() => chercher(zip)}>Rechercher</s-button>
        </s-stack>
        {message ? <s-text tone="critical">{message}</s-text> : null}

        {vue && points && points.length ? (
          <s-map
            apiKey={MAPS_KEY}
            accessibilityLabel="Carte des points relais Mondial Relay"
            latitude={vue.latitude}
            longitude={vue.longitude}
            zoom={vue.zoom}
            blockSize="280px"
          >
            {points.map((p, i) => (typeof p.lat === 'number' && typeof p.lng === 'number' ? (
              <s-map-marker
                key={p.id}
                latitude={p.lat}
                longitude={p.lng}
                accessibilityLabel={`${i + 1}. ${p.name}`}
                commandFor={`bbp-mr-pop-${i}`}
                onClick={() => setChoisi(p.id)}
              />
            ) : null))}
            {points.map((p, i) => (
              <s-popover key={`pop-${p.id}`} id={`bbp-mr-pop-${i}`}>
                <s-box padding="small-100">
                  <s-text type="strong">{i + 1}. {p.name}</s-text>
                </s-box>
              </s-popover>
            ))}
          </s-map>
        ) : null}

        {recherche && !points ? (
          <s-stack direction="inline" gap="base"><s-spinner /><s-text>Recherche des points relais…</s-text></s-stack>
        ) : null}

        {points && points.length ? (
          <s-scroll-box maxBlockSize="320px">
            <s-choice-list name="point-relais" onChange={(e) => setChoisi((e.currentTarget.values || [])[0] || '')}>
              {points.map((p, i) => (
                <s-choice key={p.id} value={p.id} selected={p.id === choisi}>
                  {i + 1}. {p.name}{p.locker ? ' · Locker 24/7' : ''}
                  <s-text slot="details">{adresse(p)}{horairesDuJour(p) ? ` — ${horairesDuJour(p)}` : ''}</s-text>
                </s-choice>
              ))}
            </s-choice-list>
          </s-scroll-box>
        ) : null}

        {selection && selection.hours ? (
          <s-stack gap="small-200">
            <s-text type="strong">Horaires — {selection.name}</s-text>
            <s-text>
              {SEMAINE.map(([k, l]) => `${l} ${horaire(selection.hours[k])}`).join(' · ')}
            </s-text>
          </s-stack>
        ) : null}
      </s-stack>
      <s-button slot="primary-action" variant="primary" loading={enregistrement} disabled={!selection} onClick={valider}>
        Valider ce point relais
      </s-button>
      <s-button slot="secondary-actions" variant="secondary" command="--hide" commandFor={MODAL_ID}>
        Fermer
      </s-button>
    </s-modal>
  );

  // Point enregistré.
  if ((phase === 'vu' || (phase === 'chargement' && cartPoint)) && point) {
    return (
      <>
      <s-banner tone="success" heading="Votre point relais Mondial Relay">
        <s-stack gap="base">
          <s-text><s-text type="strong">{point.name}</s-text> — {adresse(point)}</s-text>
          {state && state.canChange ? (
            <s-button variant="secondary" command="--show" commandFor={MODAL_ID}>
              Changer de point relais
            </s-button>
          ) : null}
        </s-stack>
      </s-banner>
      {state && state.canChange ? fenetre : null}
      </>
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

  // Aucun point encore : bandeau + bouton qui ouvre la fenêtre.
  return (
    <>
    <s-banner tone="warning" heading="Choisissez votre point relais Mondial Relay">
      <s-stack gap="base">
        <s-text>Pour que nous puissions expédier votre commande, choisissez le point relais où la retirer.</s-text>
        <s-button variant="primary" command="--show" commandFor={MODAL_ID}>
          Choisir mon point relais
        </s-button>
      </s-stack>
    </s-banner>
    {fenetre}
    </>
  );
}

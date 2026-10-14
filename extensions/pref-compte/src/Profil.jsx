// Espace client (page Profil) : invitation à compléter ou modifier ses préférences.
// Bloc statique, sans accès aux données. Lien vers la page /pages/mes-preferences
// (formulaire Klaviyo XQupRm). Le crédit de 5 € (une seule fois) est géré par bbp-webhook.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

const LIEN = 'https://www.bonsbaisers.paris/pages/mes-preferences?utm_source=shopify&utm_medium=espace_client&utm_campaign=preferences';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-section heading="Mes préférences">
      <s-stack direction="block" gap="base">
        <s-text>Dites-nous ce que vous aimez (univers, pointure, anniversaire) pour recevoir moins de messages, mais mieux choisis. Première réponse : 5 € ajoutés à votre cagnotte. Vous pouvez modifier vos réponses à tout moment.</s-text>
        <s-button href={LIEN} target="_blank">Compléter mes préférences</s-button>
      </s-stack>
    </s-section>
  );
}

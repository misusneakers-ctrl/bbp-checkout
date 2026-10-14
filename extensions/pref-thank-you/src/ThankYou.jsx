// Page de remerciement : invitation à compléter le questionnaire de préférences.
// Bloc statique, sans accès aux données. Lien vers la page /pages/mes-preferences
// (formulaire Klaviyo XQupRm). Le crédit de 5 € est géré par bbp-webhook.
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

const LIEN = 'https://www.bonsbaisers.paris/pages/mes-preferences?utm_source=shopify&utm_medium=remerciement&utm_campaign=preferences';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-heading>Complétez vos préférences, 5 € offerts</s-heading>
        <s-text>Univers, pointure, anniversaire : moins d'une minute pour recevoir des messages qui vous ressemblent. 5 € sont ajoutés à votre cagnotte.</s-text>
        <s-button href={LIEN} target="_blank" variant="secondary">Je réponds</s-button>
      </s-stack>
    </s-box>
  );
}

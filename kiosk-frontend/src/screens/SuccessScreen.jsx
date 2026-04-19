/**
 * SuccessScreen - platba proběhla
 * ----------------------------------------------------------------------------
 * Nabídne 3 velké volby:
 *   1. ÚČTENKA (default, nejběžnější)
 *   2. FAKTURA (pro firmy, zobrazí InvoiceScreen pro IČO)
 *   3. BEZ DOKLADU (minimalistické)
 *
 * Po volbě přejde na PrintingScreen.
 */

import useKioskStore, { SCREENS } from '../store/useKioskStore';
import { formatCzk } from '../utils/format';

export default function SuccessScreen() {
  const { orderNumber, getTotal, setReceiptType, setScreen } = useKioskStore();
  const total = getTotal();

  const choose = (type) => {
    setReceiptType(type);
    if (type === 'invoice') {
      setScreen(SCREENS.INVOICE);
    } else {
      setScreen(SCREENS.PRINTING);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-12 fade-in bg-gradient-to-br from-midnight via-ink to-panel">

      {/* Velká fajfka */}
      <div className="relative mb-12">
        <div className="w-48 h-48 rounded-full bg-success/20 flex items-center justify-center">
          <div className="w-36 h-36 rounded-full bg-success flex items-center justify-center">
            <svg className="w-24 h-24 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      <h1 className="text-success text-kiosk-3xl font-bold mb-4">ZAPLACENO</h1>
      <div className="text-gold text-kiosk-xl mb-2 font-bold">{formatCzk(total)}</div>
      <div className="text-cream/60 text-kiosk-base mb-16">Doklad: {orderNumber}</div>

      {/* Volba dokladu - 3 velké karty */}
      <div className="text-cream text-kiosk-lg mb-8">Chcete doklad o nákupu?</div>

      <div className="grid grid-cols-3 gap-6 w-full max-w-5xl">
        <ReceiptChoiceCard
          icon="🧾"
          title="ÚČTENKA"
          description="Běžný doklad"
          recommended
          onClick={() => choose('simplified')}
        />
        <ReceiptChoiceCard
          icon="📄"
          title="FAKTURA"
          description="Pro firmy s IČO"
          onClick={() => choose('invoice')}
        />
        <ReceiptChoiceCard
          icon="✕"
          title="BEZ DOKLADU"
          description="Nevytisknout"
          onClick={() => choose('none')}
        />
      </div>
    </div>
  );
}

function ReceiptChoiceCard({ icon, title, description, recommended, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        panel p-8 flex flex-col items-center text-center
        active:scale-95 transition-transform min-h-[240px]
        ${recommended ? 'border-4 border-gold' : 'border-2 border-panel'}
      `}
    >
      {recommended && (
        <div className="bg-gold text-midnight text-kiosk-sm font-bold px-4 py-1 rounded-full mb-4">
          DOPORUČENÉ
        </div>
      )}
      <div className="text-6xl mb-4">{icon}</div>
      <div className="text-cream text-kiosk-lg font-bold mb-2">{title}</div>
      <div className="text-cream/60 text-kiosk-sm">{description}</div>
    </button>
  );
}

/**
 * NumericKeyboard - dotyková numerická klávesnice
 * ----------------------------------------------------------------------------
 * Použití: zadávání IČO (8 číslic) a podobných čísel.
 *
 * Design:
 *   - 3 sloupce × 4 řádky (1-9, 0, DEL, OK)
 *   - Tlačítka 100x100px+
 *   - Viditelný displej s aktuální hodnotou
 */

export default function NumericKeyboard({
  value = '',
  onChange,
  onSubmit,
  maxLength = 8,
  placeholder = 'Zadejte číslo',
  label = 'Zadání',
}) {
  const press = (digit) => {
    if (value.length >= maxLength) return;
    onChange(value + String(digit));
  };

  const del = () => {
    onChange(value.slice(0, -1));
  };

  const clear = () => onChange('');

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="w-full max-w-md">
      {/* Displej */}
      <div className="bg-midnight border-2 border-gold rounded-2xl p-6 mb-6 text-center">
        <div className="text-cream/50 text-kiosk-sm mb-2">{label}</div>
        <div className="text-gold text-kiosk-2xl font-mono font-bold tracking-wider min-h-[4rem]">
          {value || <span className="text-cream/30">{placeholder}</span>}
        </div>
      </div>

      {/* Klávesnice */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map(k => (
          <button
            key={k}
            onClick={() => press(k)}
            className="btn-primary text-kiosk-2xl h-24"
          >
            {k}
          </button>
        ))}

        <button onClick={clear} className="btn-secondary text-kiosk-lg h-24">
          C
        </button>
        <button onClick={() => press(0)} className="btn-primary text-kiosk-2xl h-24">
          0
        </button>
        <button onClick={del} className="btn-secondary text-kiosk-lg h-24">
          ⌫
        </button>

        {onSubmit && (
          <button
            onClick={onSubmit}
            disabled={value.length < maxLength}
            className="btn-primary text-kiosk-lg h-24 col-span-3 mt-3 disabled:opacity-30"
          >
            POTVRDIT
          </button>
        )}
      </div>
    </div>
  );
}
